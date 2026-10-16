# Endpoints — Mini App talks straight to Serverless

`tgcloud/endpoints/<name>.js` answers at `POST /api/<name>`. The Mini App
calls it with the official bridge (initData attached + verified by Telegram):

```js
Telegram.WebApp.Serverless.call('botStatus', {}, (err, result) => { … })
```

Frontend client: `frontend/src/api/serverless.js`
(`callServerlessEndpoint` + `getServerlessBotStatus`, promise + timeout).
React hook: `frontend/src/hooks/useBotStatus.js`
(`idle|loading|ready|unavailable|error`, retryable).
First UI surface: Profile tab → "🤖 Bot link" row (visible only inside
Telegram; hidden in browser/demo mode). Kill switch:
`VITE_SERVERLESS_ENABLED=false`.

## Live endpoints

| Endpoint | Input | Returns | Used by |
|---|---|---|---|
| `botStatus` | `{}` | `{found, verificationStatus, isVerified, isVip, notificationsEnabled}` | Profile tab bot-link row |

## The routing experiment (do this once)

Telegram documents endpoints as "same host as the static site". Our Mini App
is hosted on **Vercel**, not on tgcloud static — so the open question is:
does `Serverless.call` route to the bot's Serverless backend from ANY host,
or only from `*.tgcloud.ai`?

**Test (5 min, no code):**

1. Push this branch → Vercel builds a preview deployment for it.
2. Point the TEST bot's menu button at the preview URL
   (@BotFather → bot → Bot Settings → Menu Button).
3. Open the Mini App from the test bot → Profile tab → read the bot-link row:
   - `🤖 Bot connected • …` → cross-host routing WORKS. Ship it.
   - `🤖 Bot link unavailable` → the client has no `Serverless` bridge
     (old Telegram app — update and retry).
   - `🤖 Bot link failed` → bridge exists but the call failed; long-press the
     row (title tooltip) or check `err.type`: `TIMEOUT` / transport error
     points at same-host-only routing.
4. Restore the menu button to the production URL when done.

**If same-host-only (Plan B):** deploy the frontend to tgcloud static
("Mini App Files"): build `frontend/`, copy `dist/` into this project as
`webapp/`, set `tgcloud.jsonc` → `{ "static": { "source": "webapp", "spa": true } }`,
`push` — then point the test bot at the printed `https://app*.tgcloud.ai/`
URL and re-run the test. Same-host calls are guaranteed by the platform.

## Adding a new endpoint (checklist)

1. `npx tgcloud add endpoints/<name>` (scaffolds `tgcloud/endpoints/<name>.js`).
2. Implement `export default async (input, ctx)`; caller is
   `ctx.initData.user`; refuse with `EndpointError`, never leak 500 text.
3. Extend `local-test/smoke.mjs` with a section for it → `node local-test/smoke.mjs`.
4. Add a typed wrapper in `frontend/src/api/serverless.js` + UI surface.
5. `npx tgcloud push` → test in the Mini App → document the row above.
