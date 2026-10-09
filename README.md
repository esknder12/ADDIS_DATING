# Dategram

**Dating with intention, right inside Telegram.**

Dategram is a dark, mobile-first Telegram Mini App for verified, intention-led dating. The repository contains the complete **Phase 1 foundation** and **Phase 2 onboarding experience**: Telegram authentication, PostgreSQL persistence, and the full five-section questionnaire.

## Implementation status

### Phase 1 — Foundation

- ✅ `/start` bot command with a **Go to Dategram** Web App button
- ✅ Telegram Mini App initialization and full-height mobile shell
- ✅ Server-side validation of Telegram `initData`
- ✅ Constant-time signature comparison and stale-payload rejection
- ✅ PostgreSQL user creation/update on authenticated launch
- ✅ Browser-only demo mode for local UI development
- ✅ API rate limiting, security headers, CORS allowlist, and graceful shutdown

### Phase 2 — Onboarding

- ✅ Shared, config-driven sequence with 43 screens and 31 questions
- ✅ All five sections: About You, Your Type, Lifestyle, Relationship Goals, Almost There
- ✅ Single-select, multi-select, image-grid, categorized, numeric, and city inputs
- ✅ Twelve photo, trust, algorithm, chart, badge, and testimonial interstitials
- ✅ Segmented section progress, back navigation, haptics, selected states, and loading/error states
- ✅ 18+ validation, known-city validation, and mutually exclusive “none” answers
- ✅ Resumable PostgreSQL progress and JSONB answers
- ✅ LocalStorage-backed browser preview with restart support
- ✅ Original local onboarding imagery; no external image hotlinks
- ✅ API and shared-flow test coverage

The complete UX target is documented in [`docs/DATEGRAM_PRODUCT_SPEC.md`](docs/DATEGRAM_PRODUCT_SPEC.md).

## Repository layout

```text
.
├── backend/
│   ├── src/
│   │   ├── bot/                 # grammY Telegram bot
│   │   ├── config/              # validated runtime configuration
│   │   ├── db/                  # PostgreSQL schema + repository
│   │   ├── middleware/          # Telegram initData authentication
│   │   ├── routes/              # Express API routes
│   │   ├── app.js               # Express application factory
│   │   └── server.js            # process lifecycle
│   └── test/
├── frontend/
│   ├── public/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       ├── pages/
│       └── styles/
├── shared/                      # one onboarding definition for web + API
├── compose.yaml                 # local PostgreSQL
└── package.json                 # npm workspaces
```

## Prerequisites

- Node.js 20+ (Node 22 is recommended)
- npm 10+
- PostgreSQL 14+ or Docker
- A Telegram bot created through [@BotFather](https://t.me/BotFather)
- An HTTPS URL for Telegram Mini App testing

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

With Docker:

```bash
docker compose up -d postgres
```

Or point `DATABASE_URL` at any PostgreSQL service (Neon, Supabase, Railway, etc.).

### 3. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Set at least:

```env
BOT_TOKEN=123456789:your_token_from_botfather
WEBAPP_URL=https://your-public-mini-app-url.example
DATABASE_URL=postgresql://dategram:dategram@localhost:5432/dategram
```

Never commit the real bot token. `.env` files are ignored by Git.

### 4. Configure the frontend (optional)

```bash
cp frontend/.env.example frontend/.env
```

Vite proxies `/api` to `http://127.0.0.1:4000` by default, so no frontend configuration is required for normal local development.

### 5. Run the app

```bash
npm run dev
```

- Mini App: `http://localhost:5173`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`

When opened in a normal browser during development, the frontend uses a clearly marked preview identity. It never sends demo credentials to protected API endpoints. In production, the app requires valid signed Telegram `initData`.

## BotFather setup

1. Send `/newbot` to `@BotFather` and save the token.
2. Send `/newapp`, select the bot, and create the Dategram Mini App.
3. Set the Mini App URL to your HTTPS frontend URL.
4. Use `/setmenubutton` to add **Open Dategram** with the same URL.
5. Put the URL in `WEBAPP_URL` and restart the backend.

For a local Telegram test, expose port `5173` with an HTTPS tunnel and update both BotFather and `WEBAPP_URL` to that public URL. The browser-facing frontend uses relative `/api` URLs; configure your public reverse proxy to send `/api` to the backend.

## Authentication flow

1. Telegram injects signed `initData` into the Mini App.
2. The frontend sends it as `Authorization: tma <initData>`.
3. The API derives Telegram's Web App secret from `BOT_TOKEN`.
4. The API compares signatures in constant time and checks `auth_date` freshness.
5. Only then is the Telegram user parsed and upserted in PostgreSQL.

Do not trust `initDataUnsafe` as server identity. It is used only for harmless local presentation; authenticated identity always comes from server-validated `initData`.

## API

| Method | Route | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Service/database health |
| `POST` | `/api/auth/telegram` | Telegram `tma` | Validate launch and upsert user |
| `GET` | `/api/auth/me` | Telegram `tma` | Fetch current active user |
| `GET` | `/api/onboarding` | Telegram `tma` | Resume answers and current step |
| `PUT` | `/api/onboarding/answers/:key` | Telegram `tma` | Validate and persist an answer |
| `PUT` | `/api/onboarding/progress` | Telegram `tma` | Persist interstitial/back progress |
| `POST` | `/api/onboarding/complete` | Telegram `tma` | Verify all answers and complete onboarding |

Error responses use a stable shape:

```json
{
  "error": {
    "code": "INVALID_SIGNATURE",
    "message": "Telegram auth signature is invalid"
  }
}
```

## Scripts

```bash
npm run dev       # API + Vite dev server
npm run dev:api   # API only
npm run dev:web   # frontend only
npm test          # backend unit tests
npm run build     # production frontend build
npm run check     # tests + production build
npm start         # production API process
```

## Production requirements

When `NODE_ENV=production`, startup intentionally fails unless these are present:

- `BOT_TOKEN`
- `WEBAPP_URL` using HTTPS
- `DATABASE_URL`
- `CORS_ORIGINS`

Terminate TLS at a trusted proxy, route `/api` to the Express service, serve the frontend build, and use webhook delivery instead of long polling when scaling the bot to multiple instances.

## Next phase

Phase 3 is the post-onboarding result and conversion flow:

1. Animated answer analysis and candidate-search stages
2. Match Potential result card and score visualization
3. Optional email and required name capture
4. Personalized four-week Match Plan chart
5. Accessible scratch-card discount interaction
6. Routing from completed onboarding into results and then Discover

See the product specification for exact copy, order, states, and visual behavior.
