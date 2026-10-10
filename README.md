# Dategram

**Dating with intention, right inside Telegram.**

Dategram is a dark, mobile-first Telegram Mini App for verified, intention-led dating. The repository contains the **Phase 1 foundation through Phase 9**: Telegram authentication, PostgreSQL persistence, onboarding/results, discovery, daily AI Picks, mutual matches, real-time chat, profile editing, photo management, settings, VIP, and verification. Browser-only previews continue to use the owned local demo catalog.

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

- ✅ Shared, config-driven sequence with 50 screens and 38 questions per gender journey (gender-conditional copy, religion + work questions, photo upload, bio, quiz feedback)
- ✅ All five sections: About You, Your Type, Lifestyle, Relationship Goals, Almost There
- ✅ Single-select, multi-select, image-grid, categorized, numeric, and city inputs
- ✅ Twelve photo, trust, algorithm, chart, badge, and testimonial interstitials
- ✅ Segmented section progress, back navigation, haptics, selected states, and loading/error states
- ✅ 18+ validation, known-city validation, and mutually exclusive “none” answers
- ✅ Resumable PostgreSQL progress and JSONB answers
- ✅ LocalStorage-backed browser preview with restart support
- ✅ Original local onboarding imagery; no external image hotlinks
- ✅ API and shared-flow test coverage

### Phase 3 — Results and conversion

- ✅ Animated "Analyzing your answers" checklist and candidate-search ring with rotating reviews
- ✅ Match Potential result card (type, dating style, match pool, response rate) with the score **recomputed server-side** from onboarding answers
- ✅ Optional email and required name capture with shared validators
- ✅ Personalized four-week Match Plan chart (SVG, illustrative disclaimer included)
- ✅ Accessible scratch-card discount (canvas + tap alternative, auto-reveal threshold) applying promo `dategram_oct26` (50%)
- ✅ Routing from completed onboarding into results, then into the main app

### Phase 4 — Main app

- ✅ Persistent five-tab bottom navigation: Discover, AI Picks, Likes, Chat, Profile
- ✅ Discover swipe deck: pointer gestures with button parity, rewind (swipe + match undo), super like, boosted/filter controls, expand-to-profile
- ✅ AI Picks daily curation with the persisted, swipeable selection described in Phase 6
- ✅ Likes & Matches: segmented control, blurred admirers until VIP, exact empty states
- ✅ One-to-one chat gated by the mutual-match safety invariant on both client and API
- ✅ Own profile: VIP card, verification row, settings groups, AI Profile Score placeholder, Looking-for summary built from answers
- ✅ Other-user profile: gift shop (rose/ring/diamond ⭐ with idempotent transactions), report action, swipe actions
- ✅ Bot-based verification: in-app modal, `/verify` instructions, native `video_note` submission moving verification to pending
- ✅ VIP activation with promo-code validation; production fulfillment path documented for Telegram Stars invoices
- ✅ Browser demo mode mirrors every API route against localStorage; owned local demo catalog, no external image hotlinks

### Phase 5 — Discovery and matching

- ✅ Authenticated `/api/discovery`, `/api/swipe`, and `/api/swipe/rewind` endpoints (legacy `/api/app` aliases remain supported)
- ✅ PostgreSQL discovery filters using onboarding gender, age range, and city; self, inactive/incomplete, and previously swiped users are excluded
- ✅ Verified-first, recent-first profile pages with a primary photo and basic profile details
- ✅ Reciprocal likes/superlikes create one shared match row and one chat history visible to both members
- ✅ Rewind restores the profile and transactionally removes a match created by that swipe
- ✅ Discover loads the next page when three or fewer cards remain; pointer gestures support left/pass, right/like, and up/superlike
- ✅ Haptic feedback on gesture and button actions; polling surfaces newly created matches to both accounts
- ✅ Development-only SQL fixtures for eight local discovery profiles

### Phase 6 — AI Picks

- ✅ Authenticated `/api/ai-picks` creates or reuses a per-user daily picks session
- ✅ Verified, same-city candidates are preferred; fallback relaxes verification and city while preserving age/gender eligibility
- ✅ Free users receive up to five picks/day; active VIP users receive up to fifteen
- ✅ Pick order and compatibility scores persist for the day; profiles already swiped in either feed are removed
- ✅ Each tab entry shows the three-step analysis animation for at least 2.5 seconds, then reuses the Phase 5 swipe card and match flow
- ✅ Empty state distinguishes exhausted daily picks from an empty Discover deck

### Phase 7 — Likes, matches, notifications, and boosts

- ✅ Authenticated `/api/likes/received`, `/api/matches`, and shared match-message aliases
- ✅ Server-side VIP expiry checks; one free incoming like is visible and the rest are privacy-redacted/blurred until VIP
- ✅ Profile boosts persist for 30 minutes and boosted users sort first in discovery
- ✅ Like notifications use Telegram photo spoilers for non-VIP recipients; new matches notify both participants
- ✅ Bot configures the persistent Open Dategram menu button and logs sent notifications
- ✅ Admin VIP gifts extend expiry, record a reason, and send/pin the VIP campaign message; endpoint requires `ADMIN_API_KEY`
- ✅ Likes tab includes a VIP upgrade path and a persistent profile-boost banner

### Phase 8 — Real-time chat

- ✅ Socket.IO handshake authentication reuses Telegram `initData` signature and freshness validation
- ✅ Match-authorized rooms support live messages, typing indicators, presence, and reconnect recovery
- ✅ Persisted delivery/read timestamps update sender-side receipts; REST chat history remains the fallback
- ✅ Authenticated `/api/chats` previews include unread counts; `/api/app/chats` remains an additive alias
- ✅ Offline recipients receive a Telegram bot DM with a deep link to the conversation

### Phase 9 — Profile and settings

- ✅ Authenticated own-profile GET/update routes, with `/api/app/profile` compatibility alias
- ✅ Cloudinary-backed JPG/PNG/WebP uploads (5 MB each, six-photo maximum), removal/primary promotion, and complete-list reorder
- ✅ Profile-score status/request, additional information, notification settings, support, FAQ, and privacy screens
- ✅ VIP and verification controls remain integrated; Edit Profile uses Telegram MainButton and BackButton
- ✅ Missing Cloudinary settings and invalid uploads return clear API errors

The complete UX target is documented in [`docs/DATEGRAM_PRODUCT_SPEC.md`](docs/DATEGRAM_PRODUCT_SPEC.md).

## Repository layout

```text
.
├── backend/
│   ├── src/
│   │   ├── bot/                 # grammY Telegram bot
│   │   ├── config/              # validated runtime configuration
│   │   ├── db/                  # PostgreSQL schema, repositories + dev fixtures
│   │   ├── middleware/          # Telegram initData authentication
│   │   ├── routes/              # Express API routes
│   │   ├── app.js               # Express application factory
│   │   └── server.js            # process lifecycle
│   └── test/
├── frontend/
│   ├── public/
│   │   └── images/            # owned onboarding + demo profile imagery
│   └── src/
│       ├── api/
│       ├── components/        # onboarding/, results/, app/ feature components
│       ├── hooks/
│       ├── lib/
│       ├── pages/             # OnboardingFlow, ResultsFlow, MainApp
│       └── styles/
├── shared/                    # onboarding, results, catalog — one definition for web + API
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
cp .env.example backend/.env
```

Set at least:

```env
BOT_TOKEN=123456789:your_token_from_botfather
WEBAPP_URL=https://your-public-mini-app-url.example
DATABASE_URL=postgresql://dategram:dategram@localhost:5432/dategram
```

Set `ADMIN_API_KEY` to a long random secret to enable admin VIP grants; the endpoint is disabled if it is unset. `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are optional locally but required for profile photo uploads. Never commit secrets such as the bot token, Cloudinary API secret, or admin key. `.env` files are ignored by Git.

For local discovery testing, start the API once so it initializes the schema, then load the development-only fixtures:

```bash
set -a
. ./backend/.env
set +a
psql "$DATABASE_URL" -f backend/src/db/seed.sql
```

The fixture profiles are synthetic and must not be loaded into production.

### 4. Configure the frontend (optional)

Vite proxies `/api` and Socket.IO (`/socket.io`, WebSocket-enabled) to `http://127.0.0.1:4000` by default, so no frontend configuration is required for normal local development. If your API runs elsewhere, create `frontend/.env.local` and set `VITE_API_PROXY_TARGET` to that API origin.

### 5. Run the app

```bash
npm run dev
```

- Mini App: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`

When opened in a normal browser during development, the frontend uses a clearly marked preview identity. It never sends demo credentials to protected API endpoints. In production, the app requires valid signed Telegram `initData`.

## BotFather setup

1. Send `/newbot` to `@BotFather` and save the token.
2. Send `/newapp`, select the bot, and create the Dategram Mini App.
3. Set the Mini App URL to your HTTPS frontend URL.
4. Use `/setmenubutton` to add **Open Dategram** with the same URL.
5. Put the URL in `WEBAPP_URL` and restart the backend.

For a local Telegram test, expose port `3000` with an HTTPS tunnel and update both BotFather and `WEBAPP_URL` to that public URL. The browser-facing frontend uses relative `/api` URLs; configure your public reverse proxy to send `/api` to the backend.

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
| `GET` | `/api/app/results` | Telegram `tma` | Recompute match result from stored answers |
| `POST` | `/api/app/conversion` | Telegram `tma` | Validate + persist name/email lead and close conversion |
| `POST` | `/api/app/discount` | Telegram `tma` | Validate and apply the scratch-card promo code |
| `GET` | `/api/discovery?limit=10&offset=0` | Telegram `tma` | Onboarding-filtered, un-swiped profiles with pagination |
| `POST` | `/api/swipe` | Telegram `tma` | Record pass/like/superlike; create a shared match on a mutual like |
| `POST` | `/api/swipe/rewind` | Telegram `tma` | Restore the latest swipe and remove its match if it created one |
| `GET` | `/api/ai-picks` | Telegram `tma` | Get or generate today’s stable curated selection (5 free / 15 VIP) |
| `GET` | `/api/likes/received` | Telegram `tma` | Incoming likes with one free preview and VIP-gated remaining likes |
| `GET` | `/api/matches` | Telegram `tma` | Shared matches available to either participant |
| `GET`/`POST` | `/api/matches/:id/messages` | Telegram `tma` | REST history/send fallback for a shared match conversation |
| `GET` | `/api/chats` | Telegram `tma` | Chat previews and per-conversation unread counts |
| `GET`/`PUT` | `/api/profile` | Telegram `tma` | Read/update the signed-in user’s profile |
| `POST` | `/api/profile/photos` | Telegram `tma` | Upload a JPG/PNG/WebP image (Cloudinary required; max six photos) |
| `DELETE`/`PUT` | `/api/profile/photos/:id`, `/api/profile/photos/reorder` | Telegram `tma` | Delete/promote a primary photo or reorder the complete photo list |
| `GET`/`POST` | `/api/profile/score`, `/api/profile/score/request` | Telegram `tma` | Read or request the own-profile score |
| `POST` | `/api/boost/activate` | Telegram `tma` | Activate a 30-minute profile boost |
| `GET` | `/api/boost/status` | Telegram `tma` | Read current boost status |
| `POST` | `/api/admin/vip/grant` | `x-admin-key` | Extend VIP and send the configured gift notification |
| `GET` | `/api/app/discover` | Telegram `tma` | Legacy alias for discovery |
| `POST` | `/api/app/swipes` | Telegram `tma` | Legacy alias; accepts pass/like/super_like |
| `DELETE` | `/api/app/swipes/last` | Telegram `tma` | Legacy alias for rewind |
| `GET` | `/api/app/likes` | Telegram `tma` | Admirers + matches |
| `GET` | `/api/app/matches` | Telegram `tma` | Matches with last message |
| `GET` | `/api/app/chats` | Telegram `tma` | Alias for chat previews/unread counts |
| `GET`/`PUT` | `/api/app/profile` | Telegram `tma` | Alias for own-profile read/update and profile subroutes |
| `GET`/`POST` | `/api/app/matches/:id/messages` | Telegram `tma` | Chat history / send (match-gated, rule 11) |
| `Socket.IO` | `/socket.io` | Telegram `initData` handshake | Authorized live chat, typing, presence, and receipts |
| `POST` | `/api/app/gifts` | Telegram `tma` | Idempotent Telegram Stars gift transactions |
| `POST` | `/api/app/premium/activate` | Telegram `tma` | VIP activation with promo validation |
| `POST` | `/api/app/verification/request` | Telegram `tma` | Move video-note verification to pending |

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
npm start         # preview built frontend
npm start --workspace backend  # production API process
```

## Production requirements

When `NODE_ENV=production`, startup intentionally fails unless these are present:

- `BOT_TOKEN`
- `WEBAPP_URL` using HTTPS
- `DATABASE_URL`
- `CORS_ORIGINS`

Terminate TLS at a trusted proxy, route `/api` and the WebSocket-enabled `/socket.io` path to the same Express service, and serve the frontend build. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` to enable persistent photo uploads; if they are absent, upload endpoints return a clear `503 PHOTO_STORAGE_UNAVAILABLE` response while other profile features remain available. The default Socket.IO presence adapter is single-process; configure a shared Socket.IO adapter before horizontally scaling API instances. Use webhook delivery instead of long polling when scaling the bot to multiple instances.

## Remaining production work

- Telegram Stars invoice confirmation before VIP/gift fulfillment (current demo endpoints do not charge)
- Verification moderation pipeline flipping `pending` to `is_verified`
- Mobile-viewport E2E coverage for onboarding/results, discovery, AI Picks, notifications, chat, and paywall

See the product specification for exact copy, order, states, and visual behavior.
