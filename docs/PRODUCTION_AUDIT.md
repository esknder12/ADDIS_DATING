# Dategram — Production Readiness Audit (test-bot phase)

Date: 2026-10-17 · Branch: `arena/95f0f2a6-addis-dating` · Auditor: Arena agent (code + live probes)
Scope: backend (Render + Neon Postgres), frontend (Telegram Mini App via tgcloud),
CI deploy pipeline. Production cutover is OUT of scope (deferred by owner).

## Verdict

**TEST-READY ✅ · NOT prod-ready ⛔.** No P0 blocking test-phase use was found.
Ship P1s before any production cutover.

## Test evidence (this session)

| Test | Method | Result |
|---|---|---|
| Backend unit/integration | `npm test --workspace backend` (node --test) | **95/95 pass**, incl. swipe/match/chat/auth/socket suites |
| Frontend build | CI `vite build` runs 4–12 | Green (run 12 deploys the DEMO ribbon) |
| Live backend | `GET /health` | `ok`, `database.connected: true` |
| Live API shape | `GET /api/auth/me` (no auth) | Correct `MISSING_INIT_DATA` JSON |
| Swipe→match→chat trace | Static E2E walk of `saveSwipe`/`listMatchesFor`/`listChats`/`listMessages` | Correct: mutual-like match, TX locks, both-side visibility |
| Discovery exclusion | `listDiscover` SQL | Correct: swiped users excluded |
| Auth forgery | `telegramAuth.js` | HMAC-SHA256 `WebAppData` validation — correct algorithm |
| IDOR (messages) | REST + socket paths | `ownedMatchRow` check, 403 `MATCH_REQUIRED` — enforced both paths |
| Rate limiting | `app.js` | Auth 60/min + app limiter, helmet, CORS allowlist, 32kb JSON cap |
| Upload abuse | `cloudinary.js` multer | 5MB, 1 file, `fileFilter` |
| Telegram cache | Live user screenshots + build stamps | Solved: versioned `/r<run>/` menu path + build stamp + 💖 button refresh |
| E2E in Telegram | — | **Requires human driver (tap-script below)** — no bot token in sandbox |
| Load test | — | **Blocked from sandbox** (no egress to Render). Recipe below for PC |

## The "vanished match" case (Sofi, 2026-10-16)

Symptoms: match + chat seen, then after reload chats empty and Sofi back in Discover.
Finding: backend persistence is correct (95 tests + trace). The match/chat were either
created in a **different context** (browser demo mode = localStorage-only) or the swipe
never reached the backend in that session. Not a backend bug.
Permanent fix shipped: a sticky **DEMO MODE ribbon** — any local-only session now
identifies itself. Confirm with the tap-script; if a *Telegram* match ever vanishes,
that becomes P0 with Render logs as next evidence.

## P1 — fix before production

1. **Cold start vs client timeout.** Render free sleeps; wake takes 30–60s; the app
   gives up after 10s (`client.js`). Users get `CONNECTION PAUSED` on a healthy-but-sleepy
   backend. Fix: paid Render (no sleep) and/or keep-alive ping and/or raise timeout + retry.
2. **Face gate is client-side only.** A direct `POST /api/profile/photos` skips face
   detection entirely. Fix: server-side check (Cloudinary `adv_face` or a small service)
   or explicitly accept the risk for the test phase.
3. **Uptime monitoring: none.** Nobody is paged when Render/Neon hiccups. Fix: free
   UptimeRobot (or similar) pinging `/health` every 5 min.
4. **Migration story unverified.** How schema changes reach Neon (manual SQL? migrate
   script? tgcloud `migrations` are a different system) was not verified. Fix: one
   documented `npm run migrate` path + a staging apply before prod.
5. **Menu-button cache lag.** Telegram clients can show yesterday's menu button for
   hours. Mitigated (`/r<run>/` paths + stamp). Keep the stamp; never reuse a menu path.

## P2 — harden soon

- `console.error(error)` logs full objects (may include PII) — scrub/minimize in prod.
- Face-api models (~1.9MB) download on first photo step — fine on Wi-Fi, heavy on H+.
  Keep lazy-loading; consider a smaller detector later.
- Likes polling every 5s per active user — fine for test scale; move to socket push
  before growth.
- Socket scale-out: polling bot + in-memory socket state assume ONE Render instance.
  Do not scale past 1 without sticky sessions / adapter.
- Account/data deletion flow + retention policy not reviewed — needed before real users.
- Neon backup/PITR tier + restore drill not confirmed.

- Message auth mismatch: stranger GET returns 404 `MATCH_NOT_FOUND`, POST returns 403 `MATCH_REQUIRED` — pick one before prod (cosmetic).

## Remaining tests (human / PC side)

### A. 3-minute user-flow E2E (phone, Telegram, test bot)
1. Discover → like Sofi (or anyone new) → card leaves the stack.
2. Likes tab (badge) → like back the person who liked you → **match modal** appears.
3. Open the match → send "hello test" → message appears.
4. **Close Telegram completely** (swipe away) → reopen → Matches still lists them,
   chat still shows "hello test", liked profiles NOT back in Discover.
5. Profile → Privacy → sheet opens centered, no scroll needed.
Pass = all 5. Any fail → screenshot + note the step.

### B. Load smoke (PC, against Render — only meaningful on a non-sleeping tier)
```bash
npm i -g autocannon
autocannon -c 20 -d 30 https://addis-dating.onrender.com/health
```
Watch: p99 latency, non-2xx count, Render CPU/RAM graphs. Start 20 conn; raise toward
expected peak only on paid tiers. Never load-test Neon free past its connection limit
(pool size in `db/index.js` is the ceiling — check before running).

### C. Authenticated API E2E (PC — needs YOUR test-bot token locally, never share it)
```bash
export TEST_BOT_TOKEN='<from @BotFather, test bot>'
# 1. forge initData (HMAC per telegramAuth.js), 2. POST /api/auth/telegram,
# 3. swipe → match → message → re-GET matches/messages, assert persistence.
```
(Candidate for a `backend/test/e2e-live.mjs` script in a later pass.)

## Pre-prod checklist

- [ ] P1s closed (sleep/timeout, face-gate decision, monitoring, migrations)
- [ ] Tap-script passes 3 sessions in a row, 2 different accounts mutual-matching
- [ ] Render on paid tier (or accepted sleep behavior with UX copy for it)
- [ ] Backups verified (Neon PITR + one restore drill)
- [ ] Secrets rotated into prod bot/service; test tokens never reused in prod
- [ ] Privacy policy + account deletion live and tapped through
- [ ] Store/ToS review if leaving Telegram-only distribution
