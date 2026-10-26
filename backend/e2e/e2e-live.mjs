// Live backend E2E: runs against a REAL Postgres (CI service container) with a
// FAKE bot token (same value server-side, so forged initData validates).
// Covers the Sofi regression end to end:
//   auth -> onboard fixtures -> like -> mutual match -> message ->
//   re-read matches/chats/messages (reload proof) -> discovery exclusion -> IDOR.
// NOTE: filename deliberately does NOT match `node --test` patterns, so the
// unit suite never picks it up. CI workflow: e2e-backend.yml.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:4000';
const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = process.env.BOT_TOKEN || 'e2e-fake-token';
if (!DATABASE_URL) {
  console.error('E2E: DATABASE_URL is required');
  process.exit(2);
}
const HERE = path.dirname(fileURLToPath(import.meta.url));

let step = 'init';
function assert(cond, detail) {
  if (!cond) {
    console.error(`E2E FAIL @ ${step}: ${detail}`);
    process.exit(1);
  }
  console.log(`ok - ${step}${detail ? ` (${detail})` : ''}`);
}

// Mirror of validateTelegramInitData (middleware/telegramAuth.js).
function forgeInitData({ id, first_name, username }) {
  const auth_date = String(Math.floor(Date.now() / 1000));
  const user = JSON.stringify({ id, first_name, username, language_code: 'en' });
  const params = { auth_date, user };
  const check = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...params, hash }).toString();
}

async function api(method, urlPath, initData, body) {
  const res = await fetch(API + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, json, text: text.slice(0, 300) };
}

const listOf = (payload, ...keys) => {
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  return null;
};

const A = { telegram_id: 991111111, first_name: 'E2E_Ada', username: 'e2e_ada', gender: 'female', age: 27, likes: 'male' };
const B = { telegram_id: 992222222, first_name: 'E2E_Bob', username: 'e2e_bob', gender: 'male', age: 29, likes: 'female' };
const C = { telegram_id: 993333333, first_name: 'E2E_Cid', username: 'e2e_cid', gender: 'male', age: 30, likes: 'female' };

const pool = new pg.Pool({ connectionString: DATABASE_URL });
try {
  step = 'schema loads (npm run migrate)';
  execFileSync('node', [path.join(HERE, '..', 'scripts', 'migrate.mjs')], {
    stdio: 'inherit',
    env: process.env,
  });
  assert(true, 'migrate script applied + verified schema.sql');

  const initA = forgeInitData({ id: A.telegram_id, first_name: A.first_name, username: A.username });
  const initB = forgeInitData({ id: B.telegram_id, first_name: B.first_name, username: B.username });
  const initC = forgeInitData({ id: C.telegram_id, first_name: C.first_name, username: C.username });

  step = 'auth A/B/C via forged initData';
  const rA = await api('POST', '/api/auth/telegram', initA);
  const rB = await api('POST', '/api/auth/telegram', initB);
  const rC = await api('POST', '/api/auth/telegram', initC);
  assert(rA.status === 200 && rA.json?.success, `A: ${rA.status} ${rA.text}`);
  assert(rB.status === 200 && rB.json?.success, `B: ${rB.status} ${rB.text}`);
  assert(rC.status === 200 && rC.json?.success, `C: ${rC.status} ${rC.text}`);
  const aId = String(rA.json.user.id);
  const bId = String(rB.json.user.id);
  const cId = String(rC.json.user.id);

  step = 'seed fixtures (onboarded users with preferences)';
  for (const u of [A, B, C]) {
    await pool.query(
      `UPDATE users SET onboarding_completed = TRUE, gender = $2, age = $3,
         name = $4, city = 'E2E City', country = 'E2E Land'
       WHERE telegram_id = $1`,
      [u.telegram_id, u.gender, u.age, u.first_name],
    );
    await pool.query(
      `INSERT INTO onboarding_answers (user_id, question_key, answer_value)
       VALUES ((SELECT id FROM users WHERE telegram_id = $1), 'interested_in_gender', $2::jsonb)
       ON CONFLICT (user_id, question_key) DO UPDATE SET answer_value = EXCLUDED.answer_value`,
      [u.telegram_id, JSON.stringify(u.likes)],
    );
  }
  assert(true, '3 users onboarded');

  step = 'A likes B (no match yet)';
  const s1 = await api('POST', '/api/swipe', initA, { swipedUserId: bId, action: 'like' });
  assert(s1.status === 200 && s1.json?.matched === false, `${s1.status} ${s1.text}`);

  step = 'B likes A (match!)';
  const s2 = await api('POST', '/api/swipe', initB, { swipedUserId: aId, action: 'like' });
  const matchId = s2.json?.match?.id ? String(s2.json.match.id) : null;
  assert(s2.status === 200 && s2.json?.matched === true && matchId, `${s2.status} ${s2.text}`);

  step = 'A messages the match';
  const m1 = await api('POST', `/api/matches/${matchId}/messages`, initA, { content: 'hello e2e' });
  assert([200, 201].includes(m1.status) && (m1.json?.message || m1.json?.success), `${m1.status} ${m1.text}`);

  step = 'B reads messages (sees hello e2e)';
  const m2 = await api('GET', `/api/matches/${matchId}/messages`, initB);
  const msgs = listOf(m2.json, 'messages', 'data') || [];
  assert(
    m2.status === 200 && msgs.some((m) => String(m.body || m.content || m.text || '').includes('hello e2e')),
    `${m2.status} ${m2.text}`,
  );

  step = 'SOFI REGRESSION: matches survive re-read';
  const g1 = await api('GET', '/api/matches', initA);
  const matches = listOf(g1.json, 'matches', 'data') || [];
  assert(g1.status === 200 && matches.some((m) => String(m.id) === matchId), `${g1.status} ${g1.text}`);

  step = 'SOFI REGRESSION: chats survive re-read';
  const g2 = await api('GET', '/api/chats', initA);
  const chats = listOf(g2.json, 'chats', 'matches', 'data') || [];
  assert(g2.status === 200 && chats.some((m) => String(m.id) === matchId), `${g2.status} ${g2.text}`);

  step = 'SOFI REGRESSION: swiped user excluded from discovery';
  const d1 = await api('GET', '/api/discovery?limit=30', initA);
  const profiles = listOf(d1.json, 'profiles', 'data') || [];
  assert(
    d1.status === 200 && !profiles.some((p) => String(p.id) === bId),
    `${d1.status} profiles=${profiles.length}`,
  );

  step = 'IDOR: stranger C cannot read the match';
  const x1 = await api('GET', `/api/matches/${matchId}/messages`, initC);
  assert(x1.status === 404 && x1.json?.error?.code === 'MATCH_NOT_FOUND', `${x1.status} ${x1.text}`);

  step = 'double-like is idempotent (still one match)';
  const s3 = await api('POST', '/api/swipe', initA, { swipedUserId: bId, action: 'like' });
  const g3 = await api('GET', '/api/matches', initA);
  const matches2 = listOf(g3.json, 'matches', 'data') || [];
  assert(s3.status === 200 && matches2.length === 1, `${s3.status} matches=${matches2.length}`);

  step = 'A blocks C';
  const b1 = await api('POST', `/api/users/${cId}/block`, initA);
  assert(b1.status === 200 && b1.json?.blocked === true, `${b1.status} ${b1.text}`);

  step = 'blocked list shows C';
  const bl = await api('GET', '/api/blocks', initA);
  const blocked = listOf(bl.json, 'blocked', 'data') || [];
  assert(bl.status === 200 && blocked.some((x) => String(x.id) === cId), `${bl.status} ${bl.text}`);

  step = 'blocked user excluded from discovery';
  const d2 = await api('GET', '/api/discovery?limit=30', initA);
  const profiles2 = listOf(d2.json, 'profiles', 'data') || [];
  assert(d2.status === 200 && !profiles2.some((x) => String(x.id) === cId), `${d2.status} profiles=${profiles2.length}`);

  step = 'swipe on blocked profile rejected';
  const s4 = await api('POST', '/api/swipe', initA, { swipedUserId: cId, action: 'like' });
  assert(s4.status === 403 && s4.json?.error?.code === 'USER_BLOCKED', `${s4.status} ${s4.text}`);

  step = 'B blocks A: match hidden both sides, chat closed';
  const b2 = await api('POST', `/api/users/${aId}/block`, initB);
  assert(b2.status === 200, `${b2.status} ${b2.text}`);
  const g4 = await api('GET', '/api/matches', initB);
  const matchesB = listOf(g4.json, 'matches', 'data') || [];
  assert(!matchesB.some((m) => String(m.id) === matchId), `B still sees match: ${g4.text}`);
  const g4a = await api('GET', '/api/matches', initA);
  const matchesA = listOf(g4a.json, 'matches', 'data') || [];
  assert(!matchesA.some((m) => String(m.id) === matchId), `A still sees match: ${g4a.text}`);
  const m3 = await api('GET', `/api/matches/${matchId}/messages`, initB);
  assert(m3.status === 404, `${m3.status} ${m3.text}`);
  const m4 = await api('POST', `/api/matches/${matchId}/messages`, initB, { content: 'should fail' });
  assert(m4.status === 403, `${m4.status} ${m4.text}`);

  step = 'B unblocks A: match restored';
  const u1 = await api('DELETE', `/api/users/${aId}/block`, initB);
  assert(u1.status === 200 && u1.json?.unblocked === true, `${u1.status} ${u1.text}`);
  const g5 = await api('GET', '/api/matches', initB);
  const matchesB2 = listOf(g5.json, 'matches', 'data') || [];
  assert(matchesB2.some((m) => String(m.id) === matchId), `${g5.status} ${g5.text}`);

  step = 'A reports C (spam + block)';
  const r1 = await api('POST', `/api/users/${cId}/report`, initA, { reason: 'spam', details: 'e2e probe', block: true });
  assert(r1.status === 201 && r1.json?.report?.id && r1.json?.blocked === true, `${r1.status} ${r1.text}`);

  step = 'admin lists reports';
  const admRes = await fetch(`${API}/api/admin/reports`, { headers: { 'x-admin-key': 'e2e-admin' } });
  const admJson = await admRes.json();
  const admReports = Array.isArray(admJson?.reports) ? admJson.reports : [];
  assert(admRes.status === 200 && admReports.some((r) => r.reason === 'spam' && r.reported_id === cId), `${admRes.status} n=${admReports.length}`);

  step = 'deletion requires the DELETE confirmation';
  const del0 = await api('DELETE', '/api/account', initC, { confirmation: 'nope' });
  assert(del0.status === 422 && del0.json?.error?.code === 'INVALID_INPUT', `${del0.status} ${del0.text}`);

  step = 'C deletes their account';
  const del1 = await api('DELETE', '/api/account', initC, { confirmation: 'DELETE' });
  assert(del1.status === 200 && del1.json?.deleted === true, `${del1.status} ${del1.text}`);

  step = 'deleted account reads as not-found';
  const meC = await api('GET', '/api/auth/me', initC);
  assert(meC.status === 404 && meC.json?.error?.code === 'USER_NOT_FOUND', `${meC.status} ${meC.text}`);

  step = 'deleted profile vanishes from A blocks list';
  const bl2 = await api('GET', '/api/blocks', initA);
  const blocked2 = listOf(bl2.json, 'blocked', 'data') || [];
  assert(bl2.status === 200 && !blocked2.some((x) => String(x.id) === cId), `${bl2.status} ${bl2.text}`);

  step = 'A match with B survives C deletion';
  const g6 = await api('GET', '/api/matches', initA);
  const matches3 = listOf(g6.json, 'matches', 'data') || [];
  assert(g6.status === 200 && matches3.some((m) => String(m.id) === matchId), `${g6.status} ${g6.text}`);

  console.log('E2E PASS: swipe -> match -> message -> persistence, all steps green');
} finally {
  await pool.end();
}
