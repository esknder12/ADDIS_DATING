# AGENTS.md — Dategram Serverless bot

Orientation for AI coding assistants (and humans) working in `serverless/`.
This file is auto-loaded by Claude Code, Cursor, and similar tools — keep it
short and true. Full SDK reference: [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).
Feature map to the main backend: [docs/PORT_MAP.md](docs/PORT_MAP.md).

## What this project is

The **Dategram Telegram bot** running on Telegram Serverless (tgcloud):
plain JavaScript modules executed in a V8 isolate on Telegram's own
infrastructure — no VPS, no polling, no npm at runtime. It is the bot-side
twin of the main Express + PostgreSQL backend in `../backend/`:

- **Serverless owns:** inbound chat (`/start`, `/verify`, video notes,
  inline buttons), the SQLite user/verification/notification mirror, and
  outbound notifications via the Bot API.
- **Main backend owns:** the Mini App REST API, PostgreSQL truth, Socket.IO
  real-time chat, Cloudinary photo uploads.
- **Bridge:** `tgcloud/lib/bridge.js` forwards lookups/intakes to the main
  API over HTTP; everything degrades gracefully when the bridge is off.

## Layout

This folder is a standard tgcloud project root (see `tgcloud.jsonc`).

| Path                       | What it is                                                              |
|----------------------------|-------------------------------------------------------------------------|
| `tgcloud/schema.js`        | SQLite schema — tables as **named exports**. One file.                  |
| `tgcloud/lib/`             | Shared modules (`config`, `text`, `keyboards`, `users`, `bridge`, `notifications`, `setup`). |
| `tgcloud/handlers/`        | Update handlers, **one level only** (`message`, `callback_query`).      |
| `tgcloud/endpoints/`       | Mini App RPC (`POST /api/<name>`), **one level only** (`botStatus`).    |
| `tgcloud.jsonc`            | Project config. No `static` — bot code only.                            |
| `docs/`                    | Reference docs. Not deployed.                                           |
| `.tgcloud/`                | CLI state. **Never edit.** Gitignored.                                  |

## Module rules (they bite)

- Relative imports **with `.js`**: `from '../schema.js'`, `from '../lib/users.js'`.
- SDK by name: `from 'sdk'` (`db`, `api`, `fetch`, `BotApiError`, `EndpointError`),
  `from 'sdk/db'` (schema DSL + query builder + operators).
- **No npm, no filesystem, no `process.env`** at runtime. Config lives in
  `tgcloud/lib/config.js` as constants — edit + push to change it.
- **Every DB call is async — always `await`** (`.all()/.get()/.run()`, …).
- **No foreign keys** — `.references()`/`foreignKey()` throw at deploy.
- Drops only via `.deprecated('reason')`; deploys never touch the DB.
- Handler default export gets the update **payload** (`update.message`, …);
  full update is `ctx.update`. Endpoint default export gets `(input, ctx)`
  with verified `ctx.initData.user`.

## Workflow

```bash
cd serverless
npm install
npx tgcloud login      # paste the BotFather → Serverless → CLI Access token
npx tgcloud status     # local vs cloud diff
npx tgcloud push       # deploy bot code (never touches the DB)
npx tgcloud migrate    # apply tgcloud/schema.js changes (interactive)
npx tgcloud webhook    # platform-managed webhook state (derived from handlers/)
```

Edit `tgcloud/lib/config.js` (`WEBAPP_URL`, `DATEGRAM_API_URL`) before the
first push. Test on a **test bot** first — never the live dating bot.
