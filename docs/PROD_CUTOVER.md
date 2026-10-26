# LibMatch — Production cutover runbook (test → live)

Goal: a **separate, paid, always-on production stack** (bot + app + API +
database) while the test stack keeps running untouched for experiments.

Principles:

- Prod is separate everything: bot, database, backend, frontend URL.
- No new git branches needed: the prod backend tracks the same branch with
  **auto-deploy OFF** — every prod deploy is a deliberate manual click on a
  certified commit.
- Test stays exactly as it is. Nothing here modifies the test stack.

## Costs (verified 2026-10-26)

| Piece | Choice | Cost |
|---|---|---|
| Postgres (Neon) | New project on **Launch** (usage-based, no minimum), history window set to **7 days** | ~$2–5/mo at small scale (storage $0.35/GB-mo, compute $0.106/CU-hr, history $0.20/GB-mo) |
| Backend (Render) | New web service on **Starter**, Hobby workspace | **$7/mo** flat, always-on (no sleep) |
| Frontend | Second tgcloud project (prod) or Vercel — see Phase 1 | $0 (both have free tiers that fit) |
| Bots/media | BotFather bot (free), same Cloudinary account, separate folder | $0 |

Rough total to go live: **under $12/mo**.

## Test vs prod map

| | TEST (today) | PROD (new) |
|---|---|---|
| Bot | `@addisdatingtest_Bot` | new, e.g. `@LibMatchAppBot` (BotFather decides availability) |
| Mini App URL | `https://app8948725364.tgcloud.ai/r<N>/` | new prod URL (Phase 1 choice) |
| API | `addis-dating-test.onrender.com` (Free, sleeps) | new Render service (Starter, always-on) |
| Database | Neon test project | new Neon project (Launch, 7-day history) |
| Media | Cloudinary `libmatch/…` | same account, `libmatch-prod/…` folder |

## Phase 1 — decisions (owner, 10 minutes)

1. **Prod bot username.** 2–3 ideas ending in `bot`, e.g. `LibMatchAppBot`,
   `LibMatchBot`, `LibMatchDatingBot`. BotFather rejects taken names.
2. **Neon Launch: yes.** Open the billing page, attach a card, upgrade the
   NEW prod project only (test stays Free). Set history window to 7 days.
3. **Render Starter $7/mo: yes.** Hobby workspace is fine; no $25 Pro needed.
4. **Prod frontend hosting.** Recommendation: **second tgcloud project**
   (same pipeline as test, separate app + menu). Alternative: Vercel
   production project with manual `--prod` deploys. Either works; say which
   and the pipeline gets built for it.

## Phase 2 — accounts (owner, ~30 minutes)

1. **Neon:** create project `libmatch-prod` in the **Frankfurt** region
   (same region as the backend = fast). Upgrade it to Launch, set the
   history window to 7 days, copy the pooled connection string.
2. **BotFather:** `/newbot` → name `LibMatch`, username from Phase 1 →
   save the token. Set the bot's description + profile photo.
   Leave the menu button empty — the pipeline sets it per deploy.
3. **Render:** New → Web Service → repo `esknder12/ADDIS_DATING` →
   branch `arena/95f0f2a6-addis-dating` → region Frankfurt →
   plan **Starter** → **Auto-Deploy: OFF** → create. Do NOT deploy yet.
4. **Cloudinary:** nothing to create — prod uses folder `libmatch-prod/…`
   via the `CLOUDINARY_FOLDER_PREFIX` env var (Phase 3).

## Phase 3 — prod env vars (owner, 15 minutes)

On the NEW Render service only. `Generate` = Render's random button.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `BOT_TOKEN` | prod bot token (BotFather) — NEW |
| `WEBAPP_URL` | prod Mini App URL (Phase 4) — NEW |
| `DATABASE_URL` | prod Neon pooled string — NEW |
| `DATABASE_SSL` | `true` |
| `CORS_ORIGINS` | prod Mini App origin, no trailing slash — NEW |
| `ADMIN_API_KEY` | `Generate` — ROTATED (never reuse test's) |
| `ADMIN_TELEGRAM_ID` | same owner id as test |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | same account as test |
| `CLOUDINARY_FOLDER_PREFIX` | `libmatch-prod` |
| `TELEGRAM_AUTH_MAX_AGE_SECONDS` | `86400` (same as test) |

Production boot refuses to start without `BOT_TOKEN`, `WEBAPP_URL`
(https), `DATABASE_URL`, `CORS_ORIGINS` — that assertion is the checklist.

## Phase 4 — first prod deploy (owner + agent)

1. Agent certifies a commit (tests + E2E green on it).
2. Owner: Render → prod service → **Manual Deploy → Deploy latest commit**
   (the certified one).
3. Owner: open `https://<prod-api>/health?fresh=1` — expect
   `status: ok`, `service: libmatch-api`, `botUsername: <prod bot>`,
   `commit: <certified short SHA>`. The `commit` field proves WHAT is live.
4. Agent: run schema init against prod (`migrate`, pointed at the prod
   database — never the other way around).
5. Agent: deploy the frontend to the prod host (Phase 1 choice) and point
   the PROD bot's menu button at it. Test bot menu stays on test.
6. Owner: `/start` the prod bot → open the app → confirm it loads.

## Phase 5 — validation (owner, 30 minutes)

Same 9-step tap script as test (safety block/report, photos, likes,
matches, chat, verification video, owner review DMs, VIP paywall), plus:

- Upload a photo → owner gets the review DM → ✅ → visible to others.
- Second account sends a verification video → owner gets video + profile
  photo + card → ✅ → badge appears.
- `ADMIN_API_KEY` (prod) answers the admin queue endpoints.
- UptimeRobot: add a SECOND monitor on the prod `/health` (5 min).

## Phase 6 — backup drill on prod (owner + agent, 20 minutes)

Follow `docs/BACKUP_DRILL.md` against the PROD project: restore to a
**child branch** at a chosen timestamp, verify data, delete the branch.
Prod data is never touched by the drill. Log the date + result here:

- Drill 1: ____-__-__ result: ____

## Phase 7 — go-live + rollback

Go-live = Phase 5 all-pass + Phase 6 logged. Invite users to the PROD bot
only; test bot stays your playground.

Rollback, in order:

1. Bad backend deploy → Render → prod service → **Rollback** button.
2. Bad data (deleted/overwritten rows) → Neon → prod project → restore the
   root branch to a timestamp inside the 7-day window.
3. Bad frontend → redeploy the previous known-good frontend build and
   re-point the prod menu button.

Keep test and prod credentials in separate notes. Never paste prod secrets
in chat, screenshots, or issues.
