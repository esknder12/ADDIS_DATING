# Test bot runbook — @addisdatingtest_Bot 🧪

Everything for the sandbox deploy in one place. The live bot
(@addisdating_Bot) is **never touched** by this runbook.

## 0. Status board (edit as you go)

- [ ] @BotSupport enabled Serverless (button visible in @BotFather → test bot)
- [ ] Old exposed test-bot token revoked (API Token → Revoke current token)
- [x] `WEBAPP_URL` decided → `https://addisdating.vercel.app/` (Vercel, live ✅)
- [ ] `npx tgcloud login` works (`npx tgcloud status` runs)
- [ ] `npx tgcloud push` deployed
- [ ] `npx tgcloud migrate` applied the schema
- [ ] `/start` answered by Serverless (test script below passes)

## 1. Login (needs the Serverless button first)

```bash
cd serverless
npm install
npx tgcloud login     # paste the CLI Access token:
                      # @BotFather → @addisdatingtest_Bot → Serverless → CLI Access
npx tgcloud status    # should run without errors = login OK
```

> The CLI Access token is NOT the bot API token. Never screenshot either.

## 1b. Self-test the bot on your PC (recommended, 10 seconds, no Telegram needed)

```bash
cd serverless
git pull
node local-test/smoke.mjs
```

This runs the REAL bot code with a fake Telegram: 48 checks across schema,
commands, video notes, buttons, the Mini App endpoint and all four
notifications. All green = safe to `push`.

## 2. Decide WEBAPP_URL (pick one)

**A. You have a deployed Mini App URL** (Vercel / Netlify / Cloudflare / VPS):
set it in `tgcloud/lib/config.js` → all "Open Dategram" buttons work.

**B. Not deployed yet:** deploy `frontend/` free with these exact settings
(verified: `npm run build --workspace frontend` → `frontend/dist/`).
Root Directory must stay repo root `.` — the frontend needs the `@dategram/shared`
workspace installed from the root:

*Vercel (recommended):* vercel.com → Add New Project → Import
`esknder12/ADDIS_DATING` → Framework `Vite` → Root Directory `.` →
Build Command `npm run build --workspace frontend` →
Output Directory `frontend/dist` → Deploy. No env vars needed
(demo mode is ON by default, so the app loads without a backend).

*Cloudflare Pages (alternative):* Pages → Connect to Git → same repo →
Build command `npm run build --workspace frontend` →
Build output `frontend/dist` → Deploy.

Then paste the resulting `https://…` URL back here (or set it as
`WEBAPP_URL` in `tgcloud/lib/config.js` + `npx tgcloud push`).

**C. Bot-only test for now:** leave the placeholder. Commands, verification
video notes, menus and text notifications all work; web_app buttons and the
menu button stay off until a real URL is set. (The bot never crashes on a
missing URL — keyboards degrade gracefully.)

`DATEGRAM_API_URL` stays `''` (standalone mode) until the bridge endpoints
exist on the main backend — see README "Bridge endpoints".

## 3. Deploy

```bash
npx tgcloud status    # review the diff
npx tgcloud push      # deploy bot code (never touches the DB)
npx tgcloud migrate   # create the SQLite tables (interactive)
npx tgcloud webhook   # must show "in sync"
```

## 4. Test script (in Telegram, with @addisdatingtest_Bot)

1. `/start` → welcome + menu with buttons. ✅
2. Tap **✅ Verify** → nudge + instructions appear. ✅
3. Record a **circular video note** in the chat → "Got your video! ✅". ✅
4. `/vip`, `/help`, `/about`, `/app` → each answers. ✅
5. Type plain text (`hello`) → friendly fallback + menu. ✅
6. Tap **« Back** on any sub-screen → returns to the menu. ✅
7. (Needs Bot API token, later) block the bot → notifications stop without
   errors; unblock → `/start` works again. ✅

Debug from your laptop without Telegram:

```bash
npx tgcloud run handlers/message \
  '{ "message_id": 1, "chat": { "id": 123 }, "from": { "id": 123, "first_name": "Test" }, "text": "/start" }' \
  --ctx '{ update: { update_id: 1 } }'
```

## 5. Rollback (if Serverless misbehaves)

The test bot has no polling backend, so rollback = point inbound back to
nothing. With the bot API token on your laptop (never in chat):

```bash
curl -s https://api.telegram.org/bot<TOKEN>/deleteWebhook
```

Then fix the code, `npx tgcloud push`, and re-check with
`npx tgcloud webhook` (`webhook sync` repairs drift).

## 6. Cutover to the live bot (only when all green)

1. `npx tgcloud login` again, this time against **@addisdating_Bot**.
2. In `tgcloud/lib/config.js`: `BOT_USERNAME = 'addisdating_Bot'`,
   re-check `WEBAPP_URL`.
3. `npx tgcloud push` + `npx tgcloud migrate`.
4. Expect the Express polling to log a `409 Conflict` and stop — harmless
   (see README "Cutover"). Outbound Express notifications keep working.
5. Re-run the test script against @addisdating_Bot.
