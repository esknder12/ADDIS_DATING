# Dategram — Production Readiness Audit v2 (evidence-backed)

Date: 2026-10-17 · Branch: `arena/95f0f2a6-addis-dating` · Auditor: Arena agent
Method: code review + unit suite + live CI E2E + live probes + dependency audit.
Scope: backend (Render + Neon Postgres), Mini App frontend (tgcloud), CI pipelines.
Out of scope: promo economics, AI-picks quality, any non-Telegram distribution.

## Verdict

**TEST-READY ✅ · PUBLIC-PROD ⛔ (7 P1s below).** No P0 found. "Public-prod" =
strangers meeting strangers; the dating-safety P1s (report/block, deletion) are what
stand between test and public, plus reliability hardening.

## Test evidence

| Test | Method | Result |
|---|---|---|
| Backend unit/integration | `npm test --workspace backend` | **95/95 pass** |
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

1. **No report/block.** A dating app with strangers and no harassment controls cannot
   go public. Endpoints + UI + enforcement in discovery/matches.
2. **No account/data deletion.** Users cannot delete themselves. Privacy-law exposure
   (GDPR-style). Endpoint + UI + cascade verify.
3. **Render free sleeps vs 10s app timeout.** Wake takes 30–60s; users see false
   `CONNECTION PAUSED`. Paid Render (no sleep) and/or keep-alive ping and/or raise
   timeout + retry copy.
4. **No migration tooling.** No `migrate` script exists; schema goes to Neon by hand.
   Every deploy risks drift. One `npm run migrate` + CI-gated or documented apply.
5. **Face gate is client-side only.** Direct `POST /api/profile/photos` skips face
   detection. Server-side check (Cloudinary `adv_face`) or explicit risk acceptance.
6. **No uptime monitoring.** Nobody is paged on Render/Neon failure. Free UptimeRobot
   on `/health` every 5 min.
7. **Menu-button cache lag.** Telegram clients can show yesterday's menu for hours.
   Mitigated (`/r<run>/` paths + build stamp + 💖 refresh). Keep the discipline:
   never reuse a menu path, keep the stamp.

## P2 — harden soon

- Full-object `console.error` (15 sites) can land PII/DB detail in Render logs — scrub.
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
