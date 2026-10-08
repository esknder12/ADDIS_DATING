# Dategram

**Dating with intention, right inside Telegram.**

Dategram is a dark, mobile-first Telegram Mini App for verified, intention-led dating. The repository contains the complete **Phase 1 foundation**, **Phase 2 onboarding experience**, **Phase 3 results and conversion flow**, and **Phase 4 bot-based video verification**: Telegram authentication, PostgreSQL persistence with migrations, the full five-section questionnaire, the post-onboarding match report, and Telegram-native video verification with a review queue.

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

### Phase 3 — Results & conversion

- ✅ Ordered migration runner with a `schema_migrations` ledger; existing Phase 2 databases upgrade in place
- ✅ Six conversion screens: analysis, match potential, optional email, required name, four-week plan, scratch discount
- ✅ Deterministic scoring shared between API and browser preview, clamped to 65–97 and stable across reloads
- ✅ Score reuse keyed on an answer fingerprint, so a changed answer rescors and a reload does not
- ✅ Per-user `DATEGRAM-XXXXXX` promo codes with collision retry and a 7-day expiry
- ✅ Resumable flow: reopening Telegram returns to the right step and never replays a revealed discount
- ✅ Custom Pointer Events scratch card with a keyboard reveal alternative and reduced-motion support
- ✅ Hash-mirrored step machine, so the device back button steps back instead of exiting the Mini App
- ✅ Browser preview parity through a LocalStorage-backed results store
- ✅ Backend and frontend test coverage (`node --test` + Vitest)

### Phase 4 — Verification

- ✅ Telegram-native round video-note capture; no camera API or capture UI in the webview
- ✅ Bot sequence: pinned message with a return button, optional example video note, instructions
- ✅ Video-note capture with the correct grammY filter and Context accessors, both regression-tested
- ✅ One open submission per user, enforced by a partial unique index rather than handler logic
- ✅ Five-state verification lifecycle with a `requested` state distinct from `pending_review`
- ✅ Admin review API behind constant-time token auth, unmounted entirely when unconfigured
- ✅ Reviewable videos via an authenticated `getFile` streaming endpoint
- ✅ Transactional, idempotent approve/reject that never notifies a user twice
- ✅ Rejection reasons from a fixed catalogue, so users never receive "Reason: undefined"
- ✅ Accessible modal: focus trap, `Esc`, backdrop close, error recovery
- ✅ Status polling that pauses when hidden and stops on terminal states
- ✅ Reusable `VerifiedBadge` for the Phase 5 swipe cards and chat headers

The complete UX target is documented in [`docs/DATEGRAM_PRODUCT_SPEC.md`](docs/DATEGRAM_PRODUCT_SPEC.md). Design records: [Phase 3](docs/PHASE_3_ARCHITECTURE.md), [Phase 4](docs/PHASE_4_ARCHITECTURE.md).

## Repository layout

```text
.
├── backend/
│   ├── src/
│   │   ├── bot/                 # grammY Telegram bot, verification messages and handlers
│   │   ├── config/              # validated runtime configuration
│   │   ├── db/                  # PostgreSQL schema, migrations + repositories
│   │   ├── middleware/          # Telegram initData authentication
│   │   ├── routes/              # Express API routes
│   │   ├── services/            # scoring, promo and results orchestration
│   │   ├── app.js               # Express application factory
│   │   └── server.js            # process lifecycle
│   └── test/
├── frontend/
│   ├── public/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── context/
│       ├── hooks/
│       ├── lib/
│       ├── pages/
│       └── styles/
├── shared/                      # onboarding definition + scoring, shared by web and API
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

Preview state lives in LocalStorage under versioned keys: `dategram:onboarding:v2:<telegramId>` for Phase 2 answers and `dategram:results:v1:<telegramId>` for Phase 3 results. The preview identity is always built with `onboardingCompleted: false`, so a reload replays the questionnaire and then the results flow; it does not model the "already finished, open the app" path. Use **Restart preview** in the onboarding menu to clear the answer key. Real Telegram sessions read both flags from PostgreSQL and resume correctly.

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
| `GET` | `/api/onboarding/results` | Telegram `tma` | Resume the results and conversion state |
| `POST` | `/api/onboarding/results/calculate-score` | Telegram `tma` | Calculate once, then return the stored match score |
| `POST` | `/api/onboarding/results/email` | Telegram `tma` | Save or skip the optional email |
| `POST` | `/api/onboarding/results/name` | Telegram `tma` | Save the required display name |
| `POST` | `/api/onboarding/results/promo` | Telegram `tma` | Get or create the discount code |
| `POST` | `/api/onboarding/results/complete` | Telegram `tma` | Finish the conversion flow and enter the app |
| `POST` | `/api/verification/request` | Telegram `tma` | Send the verification instructions into the bot chat |
| `GET` | `/api/verification/status` | Telegram `tma` | Poll verification state for the badge |
| `GET` | `/api/admin/verification/pending` | `Bearer` admin token | List submissions awaiting review |
| `GET` | `/api/admin/verification/:id/file` | `Bearer` admin token | Stream a submission's video note |
| `PATCH` | `/api/admin/verification/:id/approve` | `Bearer` admin token | Approve and notify the user |
| `PATCH` | `/api/admin/verification/:id/reject` | `Bearer` admin token | Reject with a catalogue reason |

The admin routes are only mounted when `ADMIN_API_TOKEN` is set, so an unconfigured deployment
returns `404` rather than exposing the review queue.

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
npm test          # backend (node --test) + frontend (vitest) unit tests
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

## Phase 3 environment variables

Optional, with the defaults shown:

```env
PROMO_DISCOUNT_PERCENT=50
PROMO_TTL_DAYS=7
SCORING_SECRET=
```

`SCORING_SECRET` salts the deterministic score and match-pool jitter. Changing it reshuffles
those figures the next time a user's score is recalculated.

## Next phase

Phase 5 is the Discover/swipe screen, which gives this conversion flow a real destination and a
home for `VerifiedBadge` and the verification card (currently hosted on the post-onboarding
shell, since no Profile tab exists yet).

Deferred items, documented in [`docs/PHASE_3_IMPLEMENTATION_PLAN.md`](docs/PHASE_3_IMPLEMENTATION_PLAN.md)
and [`docs/PHASE_4_IMPLEMENTATION_PLAN.md`](docs/PHASE_4_IMPLEMENTATION_PLAN.md):

- R1b, the optional candidate-search simulation stage
- Replacing the deterministic match-pool estimate with a real `COUNT(*)` over active profiles
- A reviewer dashboard; review is currently done through the authenticated admin API
- A retention policy for reviewed verification submissions
- An admin Telegram-ID allowlist, as the production upgrade to the token gate

See the product specification for exact copy, order, states, and visual behavior.
