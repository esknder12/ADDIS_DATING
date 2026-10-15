# Dategram bot on Telegram Serverless 🤖

JavaScript-only clone of **every Dategram bot feature**, running on Telegram's
own infrastructure — no VPS, no polling process, no PostgreSQL needed for the
bot itself.

- Bot code + SQLite live on Telegram (`tgcloud/` — the only deployed folder).
- The main backend (`../backend/`, Express + PostgreSQL + Socket.IO) is
  **untouched** and keeps serving the Mini App API.
- The two talk over HTTP through a tiny optional **bridge** (`tgcloud/lib/bridge.js`).

Full feature map: [docs/PORT_MAP.md](docs/PORT_MAP.md).
SDK reference (offline copy): [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).

## What the bot does

- `/start` — welcome + main menu + persistent "Open Dategram" menu button
- `/verify` — verification nudge + video-note instructions
- 📹 video notes — verification intake (SQLite + forward to main API)
- `/help` `/about` `/vip` `/app` + inline-button navigation
- 🔔 notifications: likes (photo spoiler for non-VIP), matches, offline chat
  DMs, VIP campaign — with 24h dedup, pinning, blocked-bot handling
- `POST /api/botStatus` endpoint for the Mini App (verification/VIP state)

## Prerequisites

- Node.js 18+ and npm
- A Telegram bot + **early access to Telegram Serverless**
  (@BotFather → your bot → **Serverless** → enable)
- The **CLI Access token** (@BotFather → your bot → Serverless → CLI Access).
  It is *different* from the bot's API token.

> ⚠️ First deploy to a **test bot** (create one with /newbot). Only move to
> the live dating bot after everything works — see "Cutover" below.

## Setup

```bash
cd serverless
npm install          # installs the tgcloud CLI as a dev dependency
npx tgcloud login    # paste the CLI Access token when asked
```

### 1. Edit the config

Open `tgcloud/lib/config.js` (there are no env vars on Serverless — config is
code, deployed with `push`):

```js
export const WEBAPP_URL = 'https://your-mini-app-host.example.com'; // required
export const DATEGRAM_API_URL = 'https://your-express-api.example.com'; // '' = standalone
export const DATEGRAM_BRIDGE_KEY = ''; // optional shared secret
```

- `WEBAPP_URL` — your Mini App frontend URL (every button needs it).
- `DATEGRAM_API_URL` — main backend base URL. Leave `''` to run standalone:
  the bot works fully on its SQLite mirror with generic fallbacks.

### 2. Deploy the code

```bash
npx tgcloud status   # shows the local → cloud diff, review it
npx tgcloud push     # deploys tgcloud/ handlers + lib + endpoints
```

`push` **never touches the database** — it only reports pending schema changes.

### 3. Create the database

```bash
npx tgcloud migrate  # applies tgcloud/schema.js (interactive, shows a diff)
```

### 4. Check the webhook

```bash
npx tgcloud webhook  # the platform derives it from handlers/ automatically
```

If it ever drifts (someone called `setWebhook` with the raw token):

```bash
npx tgcloud webhook sync
```

Now open your test bot and send `/start`. 🎉

## Testing without Telegram

`run` executes a handler/endpoint in the cloud with fake input:

```bash
# /start command
npx tgcloud run handlers/message \
  '{ "message_id": 1, "chat": { "id": 123 }, "from": { "id": 123, "first_name": "Test" }, "text": "/start" }' \
  --ctx '{ update: { update_id: 1 } }'

# Button press
npx tgcloud run handlers/callback_query \
  '{ "id": "q1", "data": "vip", "message": { "message_id": 1, "chat": { "id": 123 } } }' \
  --ctx '{ update: { update_id: 2 } }'

# Mini App endpoint (initData is passed through unverified by run)
npx tgcloud run endpoints/botStatus '{}' --ctx '{ initData: { user: { id: 123 } } }'
```

## Bridge endpoints (optional, add later)

The bridge works only if the main Express backend exposes two small internal
endpoints. Nothing here requires them — add them whenever you want hybrid mode:

```
GET /api/internal/bridge/users/by-telegram/:telegramId
→ { "user": { "id", "name", "firstName", "photoUrl", "isVip",
               "vipExpiresAt", "verificationStatus", "notificationsEnabled" } | null }

POST /api/internal/bridge/verification-intake
  { "telegramId": 123, "fileId": "DQACAg..." }
→ { "ok": true }
```

Guard both with the `x-bridge-key` header when `DATEGRAM_BRIDGE_KEY` is set.
Until then, the bot runs standalone on its SQLite mirror.

## Cutover (test bot → live bot, later)

Inbound and outbound don't conflict the way you'd fear:

- **Outbound** Bot API calls (notifications) work from anywhere, anytime —
  Express and Serverless can both send on the same bot token.
- **Inbound** is exclusive: the platform sets a webhook for your handlers,
  which makes the Express grammY **polling** fail with `409 Conflict` and
  stop (it just logs "polling stopped unexpectedly" — harmless). Outbound
  notifications from Express keep working.

So the safe cutover is: deploy here → verify `/start`, `/verify`, video
notes on the live bot → leave Express running for API + notifications.
The clean follow-up (3 lines in `backend/src/bot/bot.js`) is a
`SERVERLESS_INBOUND=true` flag that skips `bot.start()` while keeping
`bot.api` — do it when you're ready, not before.

## Troubleshooting

| Symptom | Fix |
|---|---|
| No **Serverless** button in @BotFather | Account/bot not enabled yet — ask @BotSupport with `#serverless` |
| `tgcloud login` fails | You pasted the bot API token, not the **CLI Access** token (Serverless → CLI Access) |
| Double replies | Both polling and Serverless are inbound-active — see "Cutover" |
| Buttons do nothing | `WEBAPP_URL` isn't `https://` — fix `tgcloud/lib/config.js` + `push` |
| Webhook mismatch warning | `npx tgcloud webhook sync` |
| `migrate` shows unexpected drops | Never delete from `schema.js` — mark drops with `.deprecated('reason')` |

## Keeping branches straight

- `main` — the full Dategram app (Mini App + Express + Postgres). Untouched.
- This Serverless project lives in `serverless/` and was built to move into
  its own branch. To create it locally:

```bash
git fetch origin
git checkout arena/95f0f2a6-addis-dating
git checkout -b Javascript
git push -u origin Javascript
```
