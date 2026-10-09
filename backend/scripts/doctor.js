#!/usr/bin/env node
/**
 * Phase 1 doctor — checks that the local environment can run Dategram against
 * a real Telegram bot and PostgreSQL database.
 *
 *   npm run doctor
 *
 * It reads backend/.env and verifies, in order:
 *   1. the file exists
 *   2. BOT_TOKEN looks valid and is accepted by Telegram (getMe)
 *   3. WEBAPP_URL is HTTPS and reachable
 *   4. DATABASE_URL connects, and whether the schema/users table exists
 *   5. the API on PORT (default 4000) is up and reports a connected database
 *
 * Secrets are never printed. Exit code is 1 when a blocking problem is found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(backendDir, '.env');
const rootEnvPath = path.resolve(backendDir, '..', '.env');

const ICON = { ok: '✅', warn: '⚠️ ', fail: '❌', info: 'ℹ️ ' };
const report = [];

function record(status, label, detail = '', hint = '') {
  report.push({ status, label, detail, hint });
  const line = `${ICON[status]} ${label}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (hint) console.log(`     ↳ ${hint}`);
}

function withTimeout(ms) {
  return typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

function maskToken(token) {
  const [id] = token.split(':');
  return `${id}:${'*'.repeat(8)}`;
}

function describeDatabaseUrl(raw) {
  try {
    const url = new URL(raw);
    const database = url.pathname.replace(/^\//, '') || '(none)';
    return {
      summary: `${url.hostname}:${url.port || 5432}/${database}`,
      hostname: url.hostname,
      database,
      sslmode: url.searchParams.get('sslmode'),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 1. .env file                                                        */
/* ------------------------------------------------------------------ */

function checkEnvFile() {
  console.log('\n— Configuration file');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    record('ok', 'backend/.env found');
    return true;
  }

  const hint = fs.existsSync(rootEnvPath)
    ? 'A .env exists at the repository root, but the API reads backend/.env. Move it: mv .env backend/.env'
    : 'Create it from the template: cp .env.example backend/.env';
  record('fail', 'backend/.env is missing', '', hint);
  return false;
}

/* ------------------------------------------------------------------ */
/* 2. Bot token                                                        */
/* ------------------------------------------------------------------ */

async function checkBotToken() {
  console.log('\n— Telegram bot token');
  const token = (process.env.BOT_TOKEN || '').trim();

  if (!token) {
    record('fail', 'BOT_TOKEN is empty', '', 'Paste the token from @BotFather (/mybots → your bot → API Token) into backend/.env');
    return;
  }

  if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) {
    record(
      'warn',
      'BOT_TOKEN format looks unusual',
      maskToken(token),
      'A BotFather token looks like 123456789:AAF... — check for missing characters, quotes, or spaces',
    );
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: withTimeout(8000) });
    const body = await response.json().catch(() => ({}));

    if (response.ok && body.ok) {
      record('ok', 'Telegram accepts the token', `@${body.result.username} (${maskToken(token)})`);
      return;
    }

    if (response.status === 401) {
      record('fail', 'Telegram rejected the token (401 Unauthorized)', '', 'Copy the token again from @BotFather; if it was revoked, use the new one');
      return;
    }

    record('warn', 'Unexpected answer from Telegram', `${response.status} ${body.description || ''}`.trim());
  } catch (error) {
    record(
      'warn',
      'Could not reach api.telegram.org',
      error.name === 'TimeoutError' ? 'timed out' : error.message,
      'Check your internet connection or proxy; the API needs this to run the bot',
    );
  }
}

/* ------------------------------------------------------------------ */
/* 3. Web App URL                                                      */
/* ------------------------------------------------------------------ */

async function checkWebappUrl() {
  console.log('\n— Mini App URL');
  const value = (process.env.WEBAPP_URL || '').trim();

  if (!value) {
    record('fail', 'WEBAPP_URL is empty', '', 'Set it to the public HTTPS address of the frontend (tunnel or deployment)');
    return;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    record('fail', 'WEBAPP_URL is not a valid URL', value);
    return;
  }

  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(url.hostname)) {
    record('fail', 'WEBAPP_URL points to localhost', value, 'Telegram cannot open localhost. Expose port 3000 with an HTTPS tunnel (cloudflared/ngrok) and use that URL');
    return;
  }

  if (url.protocol !== 'https:') {
    record('fail', 'WEBAPP_URL must use https://', value, 'Telegram only opens Mini Apps over HTTPS');
    return;
  }

  record('ok', 'WEBAPP_URL is HTTPS', url.origin);

  try {
    const response = await fetch(url, {
      signal: withTimeout(8000),
      redirect: 'follow',
      headers: { 'ngrok-skip-browser-warning': '1', 'User-Agent': 'dategram-doctor' },
    });
    if (response.ok) {
      record('ok', 'WEBAPP_URL is reachable', `HTTP ${response.status}`);
    } else {
      record('warn', 'WEBAPP_URL answered with an error', `HTTP ${response.status}`, 'Make sure the tunnel points at the Vite dev server on port 3000');
    }
  } catch (error) {
    record(
      'warn',
      'WEBAPP_URL is not reachable from this machine',
      error.name === 'TimeoutError' ? 'timed out' : error.message,
      'Is the tunnel running? Is npm run dev running? (A dead tunnel is the #1 cause of a blank Mini App)',
    );
  }
}

/* ------------------------------------------------------------------ */
/* 4. Database                                                         */
/* ------------------------------------------------------------------ */

async function checkDatabase() {
  console.log('\n— PostgreSQL');
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  const sslEnabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.DATABASE_SSL || '').toLowerCase());

  if (!databaseUrl) {
    record('fail', 'DATABASE_URL is empty', '', 'Paste the connection string from Neon/Supabase/Railway, or use the Docker one from compose.yaml');
    return;
  }

  const described = describeDatabaseUrl(databaseUrl);
  if (!described) {
    record('fail', 'DATABASE_URL is not a valid connection string', '', 'Expected postgresql://USER:PASSWORD@HOST:5432/DATABASE');
    return;
  }

  const isLocal = /^(localhost|127\.0\.0\.1|postgres|db)$/.test(described.hostname);
  record('ok', 'DATABASE_URL parsed', described.summary);

  // `sslmode` inside the URL takes precedence over the ssl option in node-postgres,
  // so a Neon/Supabase string with ?sslmode=require is already secure on its own.
  const sslFromUrl = described.sslmode && described.sslmode !== 'disable';
  let connectionString = databaseUrl;
  if (sslFromUrl) {
    record('ok', `SSL enabled by the connection string (sslmode=${described.sslmode})`);
    if (described.sslmode !== 'verify-full') {
      record('info', 'Tip: change sslmode=' + described.sslmode + ' to sslmode=verify-full in DATABASE_URL', '', 'Same behaviour today, and it silences a deprecation warning printed by the pg library');
      // Use the equivalent strict mode for our own test connection to keep the output clean.
      const url = new URL(databaseUrl);
      url.searchParams.set('sslmode', 'verify-full');
      connectionString = url.toString();
    }
  } else if (!isLocal && !sslEnabled) {
    record('warn', 'DATABASE_SSL is not enabled for a remote database', '', 'Hosted PostgreSQL (Neon, Supabase, Railway) normally requires DATABASE_SSL=true');
  }

  const client = new pg.Client({
    connectionString,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
  });

  try {
    await client.connect();
    const { rows: [{ version }] } = await client.query('SELECT version()');
    record('ok', 'Connected to PostgreSQL', version.split(',')[0]);

    const { rows: [{ users_table }] } = await client.query("SELECT to_regclass('public.users') AS users_table");
    if (!users_table) {
      record('info', 'Schema not initialized yet', '', 'That is normal before the first run — the API creates all tables automatically when it starts');
    } else {
      const { rows: [{ count }] } = await client.query('SELECT COUNT(*)::int AS count FROM users');
      record('ok', 'users table exists', `${count} user${count === 1 ? '' : 's'} registered`,
        count === 0 ? 'Open the Mini App from Telegram once and this number should become 1' : '');
    }
  } catch (error) {
    // Node may wrap several attempts (IPv4 + IPv6) in an AggregateError; unwrap them.
    const causes = Array.isArray(error.errors) && error.errors.length > 0 ? error.errors : [error];
    const message = [...new Set(causes.map((cause) => cause.code || cause.message).filter(Boolean))].join(', ')
      || error.message
      || String(error);
    let hint = '';
    if (/ECONNREFUSED/.test(message)) hint = 'Nothing is listening there. Is PostgreSQL running? (Docker: docker compose up -d postgres)';
    else if (/terminated unexpectedly|ECONNRESET/i.test(message)) hint = 'The connection was cut — check firewall/VPN, or that the provider\'s hostname and SSL settings are correct';
    else if (/ENOTFOUND|EAI_AGAIN/.test(message)) hint = 'Hostname not found — re-copy the connection string from your provider';
    else if (/password authentication failed/i.test(message)) hint = 'Wrong user or password in DATABASE_URL';
    else if (/does not exist/i.test(message)) hint = 'The database or role in the URL does not exist — create it or fix the name';
    else if (/ssl|certificate|server does not support/i.test(message)) hint = sslEnabled
      ? 'Try removing DATABASE_SSL (local databases usually have no SSL)'
      : 'Try DATABASE_SSL=true (hosted databases require SSL)';
    else if (/timeout/i.test(message)) hint = 'Connection timed out — check firewall, VPN, or that the provider allows connections from your network';
    record('fail', 'Could not connect to PostgreSQL', message, hint);
  } finally {
    await client.end().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* 5. Running API                                                      */
/* ------------------------------------------------------------------ */

async function checkApi() {
  console.log('\n— Running API');
  const port = Number.parseInt(process.env.PORT || '', 10) || 4000;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: withTimeout(3000) });
    const body = await response.json().catch(() => ({}));
    if (body.service !== 'dategram-api') {
      record('warn', `Port ${port} answered, but not with the Dategram API`, JSON.stringify(body).slice(0, 80));
      return;
    }
    if (body.database?.connected) {
      record('ok', `API is running on :${port} with a connected database`);
    } else {
      record('warn', `API is running on :${port} but the database is not connected`, '', 'Check the DATABASE_URL result above, then restart npm run dev');
    }
  } catch {
    record('info', `API is not running on :${port}`, '', 'Optional for this check — start it with npm run dev');
  }
}

/* ------------------------------------------------------------------ */

async function main() {
  console.log('Dategram — Phase 1 doctor');
  console.log(`Reading ${path.relative(process.cwd(), envPath) || envPath}`);

  const hasEnv = checkEnvFile();
  if (hasEnv) {
    await checkBotToken();
    await checkWebappUrl();
    await checkDatabase();
  }
  await checkApi();

  const fails = report.filter((item) => item.status === 'fail').length;
  const warns = report.filter((item) => item.status === 'warn').length;

  console.log('\n— Summary');
  if (fails === 0 && warns === 0) {
    console.log('✅ Phase 1 environment looks READY. Open your bot in Telegram, send /start, and tap "Go to Dategram".');
  } else if (fails === 0) {
    console.log(`⚠️  No blocking problems, ${warns} warning${warns === 1 ? '' : 's'} to review above.`);
  } else {
    console.log(`❌ ${fails} blocking problem${fails === 1 ? '' : 's'} — fix the ❌ items above, then run npm run doctor again.`);
  }

  process.exitCode = fails > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error('Doctor crashed unexpectedly:', error);
  process.exitCode = 1;
});
