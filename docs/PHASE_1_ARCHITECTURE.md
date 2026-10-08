# Phase 1 Architecture

## Trust boundary

The Mini App is an untrusted browser client. Telegram `initDataUnsafe` is useful for immediate presentation only and must never authorize an API operation. Every protected API request includes the original `initData`; the server validates its HMAC using the bot token and rejects stale launches.

## Runtime topology

```text
Telegram client
  ├─ opens React/Vite Mini App
  └─ talks to grammY bot via Telegram

Mini App
  └─ HTTPS /api/* → Express API

Express API
  ├─ validates Telegram initData
  └─ reads/writes PostgreSQL
```

## Design decisions

- **npm workspaces:** one lockfile and one command surface while retaining deployable frontend/backend packages.
- **Express app factory:** application setup is separate from process startup, enabling route integration tests in later phases.
- **Repository boundary:** SQL mapping does not leak PostgreSQL field names into the frontend contract.
- **Optional local services:** the API can expose health without secrets in development, but protected routes return `503`; production startup fails closed.
- **Relative frontend API URLs:** avoids browser calls to `localhost` after deployment and works with Telegram WebView/reverse proxies.
- **grammY:** avoids the deprecated `request` dependency chain in legacy Telegram bot clients.
- **Tailwind v4 + custom CSS:** provides the planned utility system while keeping the screenshot-matched shell explicit and lightweight.

## Phase 2 extension points (implemented)

Phase 2 used these boundaries as intended:

- `onboarding_answers` and `onboarding_progress` now extend the PostgreSQL schema.
- Protected onboarding routes reuse the Phase 1 authentication middleware.
- `App.jsx` routes incomplete users into the questionnaire.
- Question definitions live in the shared workspace rather than page-level conditionals.
- Telegram haptics remain isolated in `frontend/src/lib/telegram.js`.

See [`PHASE_2_ARCHITECTURE.md`](PHASE_2_ARCHITECTURE.md) for the current flow and persistence design.
