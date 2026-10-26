# LibMatch — Production Readiness Audit v2 (evidence-backed)

Date: 2026-10-17 · Branch: `arena/95f0f2a6-addis-dating` · Auditor: Arena agent
Method: code review + unit suite + live CI E2E + live probes + dependency audit.
Scope: backend (Render + Neon Postgres), Mini App frontend (tgcloud), CI pipelines.
Out of scope: promo economics, AI-picks quality, any non-Telegram distribution.

## Verdict

**TEST-READY ✅ · PUBLIC-PROD ⛔ (1 standing rule: #7 menu-cache discipline; #5
needs a server check pre-public).** No P0 found. Closed since v2: #1
report/block, #2 deletion, #3 sleep UX, #4 migrations, #6 monitoring; #5
accepted for test with runbook.

## Test evidence

| Test | Method | Result |
|---|---|---|
| Backend unit/integration | `npm test --workspace backend` | **107/107 pass** |
| Live backend E2E | CI `e2e-backend.yml` vs throwaway Postgres 16 (run 39033339978) | **GREEN** — auth→like→match→message→re-read→exclusion→IDOR→idempotency |
| Frontend builds | CI runs 4–12 | Green (stamped, cache-proof `/r<run>/` menu paths) |
| Live backend + DB | `GET /health` on Render | `ok`, `database.connected: true` |
| API error shape | `GET /api/auth/me` unauthenticated | Correct `MISSING_INIT_DATA` JSON |
| Dependencies | `npm audit --omit=dev` | **0 vulnerabilities** |
| Secrets in repo | grep bot tokens/connection strings/keys | **Clean** |
| Human E2E in Telegram | 3-min tap-script (needs phone driver) | ⏳ OPEN — decisive for the Sofi case |
| Load vs prod | — | ⛔ Blocked from sandbox; PC recipe below |

## The "vanished match" case (Sofi) — resolved, pending human confirm

Backend persistence proven correct three ways (95 tests, live E2E green, SQL trace).
Conclusion: the match/chat lived in another context (browser demo is localStorage-only)
or the swipe never reached the server that session. Shipped: sticky **DEMO MODE**
ribbon so local-only sessions self-identify. If a *Telegram* match ever vanishes after
the tap-script passes once, escalate to P0 with Render logs.

## Security checklist (all verified in code)

| Area | Evidence | Status |
|---|---|---|
| Telegram auth forgery | HMAC-SHA256 `WebAppData`, expiry 24h (`middleware/telegramAuth.js`) | ✅ |
| Chat IDOR (REST) | `ownedMatchRow`, stranger GET→404, POST→403 | ✅ |
| Chat IDOR (socket) | `hasMatchAccess` on `send_message` (`socketServer.js:161`) | ✅ |
| Socket auth | middleware on connect, disconnect on failure | ✅ |
| Admin endpoints | `X-Admin-Key` + `timingSafeEqual`, 503 when unconfigured | ✅ |
| Rate limits | 60/180/240 per min tiers + helmet + 32kb JSON cap | ✅ |
| CORS | allowlist; missing-origin allowed (native/health) | ✅ |
| Uploads | auth middleware runs BEFORE multer; 5MB/1 file/jpg-png-webp allowlist | ✅ |
| Error leakage | 500s return generic "Something went wrong" | ✅ |

## P1 — must fix before public prod

1. **No report/block.** ✅ DONE — endpoints + SafetyModal UI + discovery/match/chat
   enforcement; E2E green; live-tested in Telegram (block -> blocked list -> unblock).
2. **No account/data deletion.** ✅ DONE — `DELETE /api/account` (DELETE-typed
   confirm) + danger-zone UI; transaction wipes user row (15 FK cascades) plus
   dangling string refs; Cloudinary best-effort cleanup; E2E proves 422/200/404
   + cascade + neighbor-match survival; demo-tested.
3. **Render free sleeps vs 10s app timeout.** ✅ DONE — splash wake ping (65s
   `/health`) absorbs cold start + honest "waking up" copy + smarter retry
   message; UptimeRobot 5-min `/health` monitor doubles as keep-alive so the
   free instance no longer sleeps at all.
4. **No migration tooling.** ✅ DONE — `npm run migrate --workspace backend`
   (apply + 17-table verify, `--check` for verify-only); server boot already
   auto-applies the same idempotent file so Render self-heals; E2E dogfoods the
   script; rules in `docs/DB_MIGRATIONS.md`.
5. **Face gate is client-side only.** ✅ HUMAN-APPROVAL QUEUE SHIPPED (owner
   option A, 2026-10-26) — uploads start `pending`, hidden from others until
   approved via `GET|PATCH /api/admin/photos`; E2E proves hide→approve→visible.
   Phase 2 shipped: bot DM approve buttons + owner badges + user decision DMs
   (needs `ADMIN_TELEGRAM_ID` on Render for the DM path).
6. **No uptime monitoring.** ✅ DONE — UptimeRobot URL monitor on
   `https://addis-dating-test.onrender.com/health`, every 5 min, email alerts on.
7. **Menu-button cache lag.** Telegram clients can show yesterday's menu for hours.
   Mitigated (`/r<run>/` paths + build stamp + 💖 refresh). Keep the discipline:
   never reuse a menu path, keep the stamp.

## P2 — harden soon

- Full-object `console.error` ✅ DONE — `logError` helper (message+stack only, pg detail/query/config never logged), test-guarded; 12 other sites were already message-only.
- Stranger message auth mismatch: GET→404 `MATCH_NOT_FOUND`, POST→403
  `MATCH_REQUIRED` — pick one (cosmetic).
- Upload type check is mimetype-only (client-declared, no magic-byte sniff);
  mitigated by Cloudinary reprocessing. Fine for test.
- Likes polling every 5s/user — fine at test scale; socket push before growth.
- Single-instance assumptions: bot polling + in-memory socket state. Do not scale
  Render past 1 without sticky sessions/adapter.
- Face models (~1.9MB) on first photo step — heavy on H+. Keep lazy.
- Promo/discount abuse paths not reviewed.
- Neon backup/PITR tier + restore drill unconfirmed.

## Cannot verify from here (dashboard checklist for owner)

- [ ] Render env: `BOT_TOKEN` belongs to the TEST bot; `DATABASE_URL` = Neon test DB;
      `CORS_ORIGINS` lists only `https://app8948725364.tgcloud.ai`
- [ ] Render service tracks branch `arena/95f0f2a6-addis-dating`, Frankfurt, auto-deploy on
- [ ] Neon plan/tier + PITR enabled + one restore drill done
- [ ] Cloudinary plan usage vs photo volume; `adv_face` quota if used server-side
- [ ] Render logs show `🔗 Adopted menu webapp URL … ?v=ci-<n>` after each deploy

## Remaining tests (human / PC side)

### A. 3-minute user-flow E2E (phone, Telegram, test bot) — DO THIS
1. Discover → like someone new → card leaves.
2. Likes → like back → **match modal**.
3. Open match → send `hello test` → appears.
4. **Kill Telegram completely** → reopen → match + message persist; liked gone from Discover.
5. Profile → Privacy → sheet opens centered.
Pass = all 5. Any fail → screenshot + step number.

### B. Load smoke (PC, only meaningful on a non-sleeping tier)
```bash
npm i -g autocannon
autocannon -c 20 -d 30 https://addis-dating.onrender.com/health
```
Watch p99, non-2xx, Render CPU/RAM. Pool max is 10 (`db/index.js`) — the ceiling;
raise toward expected peak only on paid tiers, never past Neon's connection limit.

## Pre-public checklist

- [ ] P1s 1–7 closed
- [ ] Tap-script passes 3 sessions in a row, 2 accounts mutual-matching
- [ ] Paid Render (or accepted + messaged sleep behavior)
- [ ] Backups verified (Neon PITR + restore drill)
- [ ] Prod bot/service with ROTATED secrets (test tokens never reused)
- [ ] Privacy policy + deletion + report/block all tapped through
- [ ] This audit's dashboard checklist signed off
