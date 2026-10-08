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

## Phase 2 extension points

- Add `onboarding_answers` and `onboarding_progress` migrations beneath `backend/src/db/`.
- Add protected onboarding routes using the existing auth middleware.
- Route authenticated users according to `onboardingCompleted` in `App.jsx`.
- Place question definitions in a pure data module, not page-level conditionals.
- Keep Telegram native UI integration inside `frontend/src/lib/telegram.js`.
