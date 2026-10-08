# Phase 3 Implementation Plan — Post-Onboarding Results & Conversion Flow

Status: **implemented.** Everything below was built on branch `arena/80976817-addis-dating`.
The as-built record, including the deviations made during implementation, is in
[`PHASE_3_ARCHITECTURE.md`](PHASE_3_ARCHITECTURE.md).

This document reconciles the externally drafted Phase 3 specification with the repository as it
actually exists at commit `6e7c66d` (branch `arena/80976817-addis-dating`). Everything in
§1 was read out of the tree; everything in §2 is a place where the pasted spec does not
survive contact with that tree.

Screens in scope (product spec §4, `docs/DATEGRAM_PRODUCT_SPEC.md:585`):
R1 analysis → R2 match-potential result → R3 optional email → R4 name →
R5 four-week plan → R6 scratch discount → main app on Discover.

---

## 1. Verified starting point

Baseline check run in this sandbox (fresh checkout, dependencies were not installed):

```
npm install --no-audit --no-fund   →  added 224 packages
npm test                           →  # tests 16  # suites 4  # pass 16  # fail 0
npm run build                      →  ✓ 105 modules transformed, built in 9.44s
```

`docker`, `psql`, and `pg_ctl` are **not available in this sandbox**, so no Postgres-backed
test can run here. That constraint shapes §7.

Facts that constrain the design:

| Fact | Evidence |
|---|---|
| `users.name VARCHAR(255)` and `users.email VARCHAR(320)` already exist | `backend/src/db/schema.sql:13`, `:19` |
| Onboarding is 43 steps / 31 questions / 5 sections | `shared/src/onboarding.js:656` (`onboardingFlow`), confirmed by running it |
| Schema is applied by re-running one idempotent file at boot | `backend/src/db/index.js:34-35`; `schema.sql` is all `CREATE TABLE IF NOT EXISTS` |
| No migration mechanism exists | nothing under `backend/src/db/` but `index.js`, `schema.sql`, two repositories |
| `POST /api/onboarding/complete` already exists and returns `{success, completed}` | `backend/src/routes/onboarding.routes.js:107-129` |
| The last quiz question calls `completeOnboarding()` immediately | `frontend/src/hooks/useOnboarding.js:153-156`, `frontend/src/api/client.js:44-47` |
| App routes on one flag: `if (!user.onboardingCompleted)` | `frontend/src/App.jsx:24` |
| `mapUser` does not expose `email`, `bio`, `gender`, or any results field | `backend/src/db/userRepository.js:1-21` |
| There is **no router library**; `App.jsx` conditionally renders 3 pages | `frontend/package.json` deps, `frontend/src/App.jsx` |
| There is **no chart library**; a hand-built SVG growth chart already exists | `frontend/src/components/onboarding/InterstitialScreen.jsx:103-129` |
| Tests use `node --test` with in-memory repository fakes and signed `initData` | `backend/test/onboardingRoutes.test.js:6-56` |
| Browser demo mode persists to LocalStorage and never calls protected APIs | `frontend/src/hooks/useOnboarding.js:57-59`, `:148-150` |
| Claim copy is legally gated | `docs/DATEGRAM_PRODUCT_SPEC.md:972` |

---

## 2. Spec corrections — what must change before implementation

These are not style preferences. Items C1–C5 are bugs that would ship broken behaviour.

### C1 — The scoring pseudocode reads answer keys that do not exist

The spec's `calculateProfileScore` reads `answers.what_else_matters`. The real key is
`what_matters` (`shared/src/onboarding.js:88`). Read as written, the function scores the
baseline 70 for every user, silently violating acceptance criterion "score calculated from
actual onboarding answers."

### C2 — The dating-style map is keyed on option IDs that do not exist

Spec keys vs. the real `conversation_confidence` options (verified by executing the module):

| Spec key (does not exist) | Real option ID | Label | Dating style |
|---|---|---|---|
| `never_know_what_to_write` | `never_know` | "I never know what to write" | Thoughtful Starter |
| `replies_are_rare` | `rare_replies` | "I can, but replies are rare" | Persistent |
| `fine_at_it` | `confident` | "I'm fine at it" | Connector |
| `rather_she_wrote_first` | `prefer_her_first` | "I'd rather she wrote first" | Selective |

`styleMap[confidence] || 'Connector'` would return **Connector for every user**.
`date_readiness` IDs (`ready_right_match`, `ready_rusty`) and the `dealbreakers`
exclusive `none` **are** correct as specified — verified.

### C3 — There is no gender-preference question, so `estimateMatchPool(city, genderPref)` has no second argument

The flow asks `gender` (self) at step 0 and never asks who the user wants to meet. The R2
copy hardcodes "women". MVP: derive the pool from the user's own `gender` plus `city`
(opposite-gender assumption), documented as an assumption, and revisit when a preference
question is added.

### C4 — Two columns in the spec's `ALTER TABLE` already exist

`ADD COLUMN IF NOT EXISTS name VARCHAR(255)` and `... email VARCHAR(255)` are no-ops, and
the spec's `email VARCHAR(255)` disagrees with the existing `VARCHAR(320)`. Neither causes
an error; both are noise that will confuse the next reader. Drop them.

### C5 — The schema file cannot migrate an existing database

`schema.sql` uses `CREATE TABLE IF NOT EXISTS` only. On a database created by Phase 2, new
columns added to that file are **never applied** — the `IF NOT EXISTS` short-circuits and
`ALTER TABLE` statements would re-run on every boot. Phase 3 is the first phase that adds
columns to a live table, so it must introduce real migrations (§3.1).

### C6 — The flow is skipped entirely by the current completion gate

`useOnboarding.submitAnswer` calls `completeOnboarding()` on the final question
(`first_move_preference`, step 42), which sets `users.onboarding_completed = TRUE`. On the
next render `App.jsx:24` sends the user straight to `AuthenticatedHome`. **The entire
results flow is bypassed.** Acceptance criterion "re-opening the app after Phase 3
completion should NOT re-trigger the flow" also cannot be satisfied by a single flag.

Resolution: two flags. `onboarding_completed` keeps its current meaning ("quiz finished",
set at step 42, unchanged) and a new `results_completed` gates the conversion flow:

```
!onboardingCompleted                      → OnboardingFlow      (Phase 2, unchanged)
onboardingCompleted && !resultsCompleted  → ResultsFlow         (Phase 3, new)
resultsCompleted                          → main app shell      (Phase 5 placeholder)
```

This is also what makes R1→R6 resumable after an app kill, which the spec's single-flag
model does not provide.

### C7 — `Math.random()` in scoring breaks idempotency

The spec randomises ±3 on *every* call, so a reload of R2 shows a different score than the
first view, and a later "your profile" screen can contradict the number the user was shown.
Replace with deterministic jitter derived from `HMAC(secret, userId || answersHash)` and
persist the score on first calculation. Re-calculation only happens if the answer hash
changes.

### C8 — `estimateMatchPool` returns a different number on every request

Same class of bug: `Math.floor(Math.random()*40)+30` per call. Make it deterministic over
`(userId, city, isoWeek)` so the number is stable within a week and drifts believably
afterwards. A real `COUNT(*)` query is a later swap, not an MVP item — there is no profile
data to count yet.

### C9 — The promo code contradicts its own acceptance criterion

`dategram_oct26` is a single fixed string shown in the UX spec and cannot satisfy
"promo code generated is unique per user and stored in DB" (`UNIQUE` constraint). Decision:
server-generated per user, `DATEGRAM-` + 6 characters from an unambiguous alphabet
(`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, no `0/O/1/I`), `UNIQUE` index, retry-on-collision.
R6 renders the returned code, never a hardcoded one. Expiry defaults to 7 days,
configurable.

### C10 — `POST /api/onboarding/complete` is a name collision, not a new endpoint

It exists and Phase 2 calls it. The spec's "finalize onboarding" is a *different*
operation (sets `results_completed` + `results_viewed_at`, returns the user object).
Decision: leave `/complete` exactly as it is (Phase 2 semantics, Phase 2 tests keep
passing) and add `POST /api/onboarding/results/complete`. Extend the existing handler's
response additively if the frontend needs the user object — never change its 422 contract.

### C11 — No React Router, and none is needed

The spec proposes `/onboarding/analyzing` … `/onboarding/discount` routes. Introducing
`react-router-dom` means converting the whole `App.jsx` gate structure and re-testing
Phases 1–2 routing for a 6-step linear flow. Decision: an ordered step machine in a
`useResultsFlow` hook, with the step mirrored into `location.hash` (`#r/score`, `#r/name`,
…) so the Android/Telegram hardware back button moves one step back instead of exiting the
Mini App. Add the router in Phase 5 when Discover/tabs actually need it.

### C12 — No Recharts, and the chart already exists

`frontend/src/components/onboarding/InterstitialScreen.jsx:103-129` contains a hand-built
inline SVG growth chart with the exact pink gradient/area treatment R5 needs. Decision:
extract that markup into `components/onboarding-results/MatchGrowthChart.jsx`, reuse it in
R5, and add **zero** dependencies. The current production bundle is 298.71 kB raw /
93.51 kB gzip (measured by the baseline build in §1); pulling in Recharts to draw one static
4-point curve would move that number materially for no functional gain.

### C13 — `react-scratchcard-v2` vs. a custom canvas

The package exists (latest `2.0.0`, peer `react >=16.8.0`, no dependencies — verified
against the npm registry), so it *is* usable. But R6 has requirements it does not serve
well: dark/pink theming, a real completion threshold, reduced-motion support, and the
keyboard/tap alternative that `docs/DATEGRAM_PRODUCT_SPEC.md:965` mandates ("non-canvas
alternatives for scratch interaction"). Decision: **custom canvas, ~120 lines**, using
Pointer Events (one code path for touch and mouse), a low-resolution alpha mask for
threshold sampling, `touch-action: none`, plus a visible **Reveal** button and
`prefers-reduced-motion` instant-reveal. Reconsider only if the custom implementation
proves unstable on a real Telegram iOS webview.

### C14 — File paths differ from the repo convention

Spec says `pages/onboarding-results/`; the repo puts screens in `pages/` and their parts in
`components/onboarding/`. Use `components/onboarding-results/` for the pieces so Phase 3
matches Phase 2's layout. Full mapping in §6.

### C15 — R2 needs a "user's primary profile photo" that does not exist yet

There is no photo upload in Phase 1–3. Use `users.photo_url` (populated from Telegram
`photo_url` at upsert, `backend/src/db/userRepository.js:62`), falling back to the existing
initials avatar pattern from `frontend/src/pages/AuthenticatedHome.jsx:28-48`.

### C16 — Demo/browser preview must keep working

Phase 2's LocalStorage preview is a documented feature (`README.md`). If Phase 3 only talks
to the API, the flow becomes un-previewable without a bot token and Postgres. Decision:
`useResultsFlow` takes a store; `createResultsApiStore()` for Telegram users,
`createResultsLocalStore()` (same interface, LocalStorage) for `user.isDemo`.

### C17 — R1b (candidate-search simulation) is out of MVP scope

`docs/DATEGRAM_PRODUCT_SPEC.md:604` marks it optional. Ship R1→R6 first; R1b is a drop-in
extra step in the machine.

### C18 — Claim copy is gated

The rotating badge text ("Telegram Mini App of the Year 2025", "Top-10 Dating Apps, Google
Play 2026"), the 2.3× response rate, and the 2→12 matches curve are all covered by
`docs/DATEGRAM_PRODUCT_SPEC.md:972`: they must not ship publicly unsubstantiated. Keep them
identical to the existing interstitial copy that already ships (they are already in
`shared/src/onboarding.js`), and keep every illustrative claim next to its disclaimer. Flag
for sign-off before any public launch — not a code task.

---

## 3. Data layer

### 3.1 Migrations (new capability)

```
backend/src/db/
├── index.js                 # initDatabase(): run migrations after schema.sql (or instead of it)
├── migrate.js               # NEW: ensureSchemaMigrations() + runMigrations(pool)
└── migrations/
    └── 0001_results_and_promo.sql   # NEW
```

Runner contract:

- `schema_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`.
- Files read from `migrations/`, sorted by filename, applied inside one transaction each,
  recorded on success, skipped if already recorded. Never rewrite an applied file.
- Runs at boot from `initDatabase`, after the existing `schema.sql` apply, so existing
  Phase 2 databases converge without data loss and fresh databases get everything.
- `schema.sql` stays the baseline for fresh installs; migrations only add.

### 3.2 `0001_results_and_promo.sql`

```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_score SMALLINT
    CHECK (profile_score IS NULL OR (profile_score BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS score_tier VARCHAR(16),
  ADD COLUMN IF NOT EXISTS answers_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS match_pool_count INTEGER,
  ADD COLUMN IF NOT EXISTS dating_style VARCHAR(50),
  ADD COLUMN IF NOT EXISTS response_rate_multiplier NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS promo_discount_percent SMALLINT,
  ADD COLUMN IF NOT EXISTS results_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS results_completed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.answers_hash IS
  'SHA-256 of the canonicalised answer set the stored score was computed from.';

CREATE TABLE IF NOT EXISTS promo_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code CITEXT NOT NULL UNIQUE,
  discount_percent SMALLINT NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promo_codes_user_idx ON promo_codes (user_id);

COMMIT;
```

Deliberate deviations from the pasted spec, with reasons:

- `email` is **not** converted to `citext`. That is a destructive `ALTER TYPE` on a live
  column; revisit with a real backfill plan when email uniqueness becomes a product rule.
- No unique index on `users.email` yet — duplicate emails are currently a product question,
  not a bug. When it is decided, add a *partial* unique index that permits multiple NULLs.
- `answers_hash` is added (not in the spec) because C7's idempotency needs to know whether
  answers changed.
- `score_tier` is persisted so the tier shown on R2 and the tier shown anywhere later cannot
  diverge.
- `results_completed BOOLEAN NOT NULL DEFAULT FALSE` on `users` (C6), rather than overloading
  `onboarding_progress.completed`.
- `promo_codes.code` is `CITEXT` so lookups at redemption time are case-insensitive; the
  generated value is always uppercase.

### 3.3 Repository changes

`backend/src/db/userRepository.js` — extend `mapUser` (currently `:1-21`) with
`email`, `gender`, `bio`, `profileScore`, `scoreTier`, `datingStyle`, `matchPoolCount`,
`responseRateMultiplier`, `promoCode`, `promoDiscountPercent`, `resultsCompleted`,
`resultsViewedAt`. `test/userRepository.test.js` asserts the mapped shape, so this is a
visible, test-covered change.

New `backend/src/db/resultsRepository.js`:

| Method | Behaviour |
|---|---|
| `getResults(telegramId)` | user row + answers + active promo, or `null` when no user |
| `saveResults(telegramId, results)` | `UPDATE users SET profile_score, score_tier, answers_hash, match_pool_count, dating_style, response_rate_multiplier WHERE telegram_id = $1 RETURNING *` |
| `setEmail(telegramId, emailOrNull)` | normalise lowercase + trim; `null` on skip |
| `setName(telegramId, name)` | trim, collapse inner whitespace |
| `getPromo(telegramId)` | latest non-expired row for the user |
| `createPromo(telegramId, {code, discountPercent, expiresAt})` | insert; also mirror `promo_code`/`promo_discount_percent` onto `users` |
| `completeResults(telegramId)` | transaction: require `onboarding_completed`, set `results_completed = TRUE`, `results_viewed_at = COALESCE(results_viewed_at, NOW())` |

All identity comes from validated `initData` (`req.telegramUser.id`), never from the body —
`docs/DATEGRAM_PRODUCT_SPEC.md:967`, rule 8.

---

## 4. Backend

### 4.1 New files

```
backend/src/
├── routes/results.routes.js        # createResultsRouter({ resultsRepository, scoringService, promoService, runtimeConfig })
├── services/scoringService.js      # pure functions, no I/O
└── services/promoService.js        # code generation + expiry policy, no I/O
```

Mounted in `backend/src/app.js` next to the existing routers (`:55-75`), behind the same
`createTelegramAuthMiddleware(runtimeConfig)` and its own rate limiter (60/min is plenty —
the flow makes ~5 calls).

### 4.2 Endpoints

| Method & path | Purpose | Success | Errors |
|---|---|---|---|
| `GET /api/onboarding/results` | Resume: everything R1–R6 need in one call | `{success, results}` | `401`, `404 USER_NOT_FOUND`, `409 QUIZ_INCOMPLETE`, `503 DATABASE_UNAVAILABLE` |
| `POST /api/onboarding/results/calculate-score` | Compute or return the persisted score | `{success, results}` | same + `422 QUIZ_INCOMPLETE` |
| `POST /api/onboarding/results/email` | `{email}` or `{email: null}` | `{success, results}` | `422 INVALID_EMAIL` |
| `POST /api/onboarding/results/name` | `{name}` | `{success, results}` | `422 INVALID_NAME` |
| `POST /api/onboarding/results/promo` | Get-or-create the discount | `{success, promo}` | `409 NO_PROMO_AVAILABLE` |
| `POST /api/onboarding/results/complete` | Set `results_completed`, `results_viewed_at` | `{success, results, user}` | `409 RESULTS_INCOMPLETE` when `name` is missing |

`results` payload (single shape everywhere, so any screen can resume from any other):

```json
{
  "score": 87,
  "scoreTier": "VERY_HIGH",
  "yourType": "Natural, 25–30",
  "datingStyle": "Connector",
  "matchPoolCount": 57,
  "matchPoolCity": "Addis Ababa",
  "responseRateMultiplier": 2.3,
  "fourWeekGoalLabel": "One great first date",
  "email": null,
  "name": "Abel",
  "resultsViewedAt": null,
  "resultsCompleted": false,
  "photoUrl": null,
  "promo": { "code": "DATEGRAM-7QK2MX", "discountPercent": 50, "expiresAt": "2026-10-15T09:12:00.000Z" }
}
```

Validation, server-side, mirroring the client:

- email: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` after trim, ≤320 chars, lowercased. `null`/absent →
  skip, no error (acceptance: email is skippable).
- name: trimmed length 2–80, no control characters. Required.

### 4.3 `scoringService.js` — pure and deterministic

```js
export const SCORE_FLOOR = 65;
export const SCORE_CEILING = 97;

export function answersHash(answers)          // sha256 of canonical JSON, stable key order
export function calculateProfileScore(answers, { userId, secret })  // → { score, contributions }
export function getScoreTier(score)           // VERY_HIGH ≥85, HIGH ≥70, AVERAGE ≥50, LOW
export function getDatingStyle(answers)       // real conversation_confidence IDs, C2
export function getYourType(answers)          // style_preference + age_range_preference labels
export function getFourWeekGoalLabel(answers) // four_week_goal label
export function estimateMatchPool({ userId, city, gender, now, secret })
export function getResponseRateMultiplier(datingStyle)
```

Score contributions (all keys verified against `shared/src/onboarding.js`):

| Signal | Key | Rule |
|---|---|---|
| Baseline | — | `+70` |
| Thoughtfulness | `what_matters` | `+2` each, capped `+10` |
| Decisiveness | `dealbreakers` | `+3` when non-empty and not `['none']` |
| Readiness | `date_readiness` | `ready_right_match` `+5`, `ready_rusty` `+3`, `nervous_willing` `+1`, `not_sure` `0` |
| Intentionality | `looking_for` | `+2` when it includes `serious_relationship` |
| Investment | `common_interests` | `+1` per unique interest, capped `+3` |
| Openness | `first_move_preference` | `+1` unless `prefer_her_first`-adjacent passivity (`i_do`/`doesnt_matter` only) |
| Jitter | — | `±3`, deterministic: `HMAC(secret, userId ‖ answersHash)` |
| Clamp | — | `[65, 97]` after jitter, so 100 and <60 are unreachable |

`calculateProfileScore` returns its contributions so tests can assert the arithmetic and a
later A/B can retune weights without touching call sites.

Match pool: `30 + (HMAC(secret, userId ‖ city ‖ isoWeek) mod 41)` → 30–70, stable within a
week. The `genderPref` parameter from the spec is dropped (C3).

Response-rate multiplier is a function of dating style, not of score, so the number and the
label can never disagree: Connector `2.3`, Selective `2.1`, Thoughtful Starter `1.9`,
Persistent `1.6`. (Copy is claim-gated, C18.)

`yourType`: first `style_preference` label + `age_range_preference` label, e.g.
`"Natural, 25–30"`; fallback `"Curated for you"` if either is missing.

### 4.4 `promoService.js`

```js
export const DEFAULT_DISCOUNT_PERCENT = 50;
export const PROMO_TTL_DAYS = 7;
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function generatePromoCode(randomBytes)   // 'DATEGRAM-' + 6 chars
export function promoExpiry(now, ttlDays = PROMO_TTL_DAYS)
```

Generation uses `crypto.randomBytes` (not `Math.random`) and rejects `0/O/1/I` by
construction. Route logic is **get-or-create**: if the user already has a non-expired code,
return it — repeated R6 visits must show the same code. On `23505` unique violation, retry
up to 5 times, then `409 NO_PROMO_AVAILABLE`. `PROMO_TTL_DAYS` and
`PROMO_DISCOUNT_PERCENT` come from `backend/src/config/env.js` with these defaults, matching
how existing config is validated there.

---

## 5. Frontend flow control

### 5.1 Step machine

`frontend/src/hooks/useResultsFlow.js` owns:

```
analyzing → score → email → name → plan → discount → (done)
```

- On mount: `GET /api/onboarding/results` (or read the local store in demo mode).
- `analyzing` runs the ~4 s animation **and** awaits `calculate-score`; transition fires only
  when both finish (acceptance: "animation plays fully regardless of API speed"). API errors
  surface a retry state instead of a dead screen; the animation completes either way.
- Resume: `resultsViewedAt != null` → start at `discount` if `promo` is missing, else
  `plan`; `name` present → skip `name`; `email` present → skip `email`.
- Every mutation returns the full `results` object and replaces local state, so no screen
  depends on props threaded through five levels.
- Hash mirroring: entering a step writes `#r/<step>`; a `popstate`/`hashchange` listener
  moves back one step. `discount` is terminal — back from it returns to `plan`.

### 5.2 Context

`frontend/src/context/OnboardingResultsContext.jsx` provides `{ results, status, error,
update, retry }` to the six screens, per the spec's shared-context requirement. It is fed by
`useResultsFlow` at the `ResultsFlow` page level.

### 5.3 App integration (C6)

```jsx
// frontend/src/App.jsx — replaces the single check at :24
if (!user.onboardingCompleted) return <OnboardingFlow user={user} />;
if (!user.resultsCompleted) return <ResultsFlow user={user} onFinished={handleAuthenticated} />;
return <AuthenticatedHome user={user} />;
```

`onFinished` receives the updated user (with `resultsCompleted: true`) from
`POST /api/onboarding/results/complete`, so the transition into the main-app shell needs no
reload. `useOnboarding` and `POST /api/onboarding/complete` stay untouched.

### 5.4 Demo mode (C16)

`createResultsLocalStore()` implements the same six methods against
`localStorage['dategram:results:v1:<telegramId>']`, running the *same* pure scoring math
locally. Because the scoring service is pure and dependency-free, it can be imported by the
frontend from `@dategram/shared` — see §8 for where the module actually lives.

---

## 6. Components & styling

```
frontend/src/
├── pages/
│   └── ResultsFlow.jsx                      # shell + step machine + context provider
├── context/
│   └── OnboardingResultsContext.jsx
├── hooks/
│   └── useResultsFlow.js
├── api/
│   └── results.api.js                       # 6 thin wrappers over apiClient
├── components/onboarding-results/
│   ├── AnalyzingScreen.jsx                  # R1
│   ├── MatchScoreCard.jsx                   # R2
│   ├── ScoreGradientBar.jsx                 # R2 marker
│   ├── EmailCaptureScreen.jsx               # R3
│   ├── NameCaptureScreen.jsx                # R4
│   ├── MatchPlanScreen.jsx                  # R5
│   ├── MatchGrowthChart.jsx                 # extracted from InterstitialScreen.jsx:103
│   ├── ScratchCardScreen.jsx                # R6
│   └── scratch/
│       ├── ScratchCard.jsx                  # canvas + pointer events
│       ├── ScratchCardContent.jsx           # revealed discount block
│       └── useScratchReveal.js              # mask, threshold, reduced motion
└── styles/
    └── results.css                          # imported in main.jsx after onboarding.css
```

### R1 `AnalyzingScreen`

Five rows — About You, Your Type, Lifestyle, Relationship Goals, Match Potential — driven by
`onboardingSections` plus a literal `Match Potential` row, so labels cannot drift from the
shared config. Each row fills over ~800 ms then flips to a check circle; total ~4 s via a
single `setInterval` at 800 ms. Footer badge alternates every ~2 s between the two strings
already present in `shared/src/onboarding.js` (badges interstitial). `aria-live="polite"`
announces each completed row; `prefers-reduced-motion` collapses to a single indeterminate
bar.

### R2 `MatchScoreCard`

- Heading "Here's your dating profile", `MATCH POTENTIAL` label, `You: {score}` pill.
- `ScoreGradientBar`: marker at `left: ${score}%` on a grey→pink track, four evenly spaced
  labels LOW | AVERAGE | HIGH | VERY HIGH. Marker position is driven by the same numeric
  score that is displayed — no separate constant (acceptance criterion).
- Four stat rows: your type, dating style (with ⓘ explaining it), match pool
  (`{count} women in {city}`), response rate (`Above average, {n}×`).
- Photo on the right: `photoUrl` or initials avatar (C15).
- `CONTINUE` → `email`.

### R3 `EmailCaptureScreen`

Envelope-prefixed input, `type="email"`, `inputMode="email"`, `autoComplete="email"`,
`noValidate` on the form so the browser bubble never fights the inline message. `CONTINUE`
stays disabled until the regex matches; "SKIP THIS STEP" is always clickable and calls
`update({ email: null })` then advances (no validation error, per acceptance). Privacy copy
from the product spec.

### R4 `NameCaptureScreen`

Large underline input, `autoComplete="given-name"`, `maxLength={80}`. `CONTINUE` disabled
below 2 characters. No skip. On submit, the saved name is what R5 uppercases.

### R5 `MatchPlanScreen`

- Heading `{NAME}, your 4-week Match Plan is ready` — `name.toUpperCase()`, falling back to
  the Telegram first name if the step was somehow skipped.
- `MatchGrowthChart` (extracted SVG) with `2/week` and `12/week` pill badges on the
  endpoints, plus "This chart is for illustrative purposes only."
- Three benefit rows: ⭐ Perfect for your dating style · ✓ Customized based on your answers
  · ➤ Goal: `{fourWeekGoalLabel}` from the real `four_week_goal` answer.
- Footnote "*Based on Premium users with a similar profile. Results vary."

### R6 `ScratchCardScreen`

`useScratchReveal` design:

- Two stacked canvases; the cover canvas is a **low-resolution alpha mask** (e.g. 64×40)
  scaled up by CSS, so `getImageData` stays cheap on mobile.
- `pointerdown` → `setPointerCapture`, then `pointermove` strokes with
  `globalCompositeOperation = 'destination-out'`, `lineCap/lineJoin = 'round'`, brush ≈30 px.
  One code path for touch, mouse, and pen; `touch-action: none` stops scroll-stealing in the
  Telegram webview.
- Threshold: sample the mask alpha channel every ~6 strokes; at ≥60 % cleared, stop
  accepting input, then fade the cover out over ~250 ms and fire `onRevealComplete`.
- `prefers-reduced-motion: reduce` → no fade, instant clear.
- **Keyboard/tap alternative:** a visible "Reveal my discount" button underneath, required by
  `docs/DATEGRAM_PRODUCT_SPEC.md:965`. `role="img"` with an `aria-label` describing the
  covered state, and an `aria-live` announcement when the code is revealed.
- Revealed content: huge `50%` / "discount" / "on your Premium", dashed divider, "Promo
  code" label, pill with the code from `POST …/results/promo` + green check, "Applied
  automatically at checkout".
- On complete: `POST …/results/complete` → wait 1.5 s → `onFinished(user)`. Haptics via the
  existing `notify()` helper in `frontend/src/lib/telegram.js`.

### Styling

New `styles/results.css`, imported in `main.jsx` after `onboarding.css` (`:5`). Reuse the
existing shell and CTA classes rather than restyling them: `.onboarding-shell`,
`.onboarding-stage`, `.onboarding-primary` (incl. its `:disabled` and `.button-spinner`
states), `.onboarding-error`, `.question-footer`, `.sr-only`. Design tokens per product spec
§14 (`docs/DATEGRAM_PRODUCT_SPEC.md:882`): 20–24 px side padding, 52–56 px CTAs, 16–20 px
card radius, `#ff2d55` accent, ≥44 px hit targets, `focus-visible` on every control,
`env(safe-area-inset-bottom)` on sticky CTAs.

---

## 7. Testing & verification

### Automated — runs in this sandbox (no Postgres needed)

| File | Covers |
|---|---|
| `backend/test/scoringService.test.js` | real answer keys; min/max clamp `[65, 97]`; determinism for identical input; tier boundaries 85/70/50; style map for all four real IDs; `yourType` label composition; pool stable within a week and inside 30–70 |
| `backend/test/promoService.test.js` | code format and alphabet; uniqueness over 10 000 draws; expiry = now + 7 d |
| `backend/test/resultsRoutes.test.js` | auth 401 without `tma`; `503` when repository unavailable; invalid email/name → `422`; skip email → `200`; name required; promo idempotent across two calls; `results/complete` requires a name; `GET /results` resume payload |
| `backend/test/userRepository.test.js` (extend) | new `mapUser` fields |
| `backend/test/migrate.test.js` | filename ordering, skip-already-applied, records on success |

Pattern: mirror `backend/test/onboardingRoutes.test.js` — fake repository, real Express app,
signed `initData`.

Gate: `npm test` (must stay ≥16 passing plus the new suites) and `npm run build`.

### Cannot be verified in this sandbox — must be done by hand

1. `docker compose up -d postgres`, boot the API against a **Phase 2 database** and confirm
   `0001_results_and_promo.sql` applies and `schema_migrations` has one row.
2. Fresh database: confirm schema + migration produce an identical `\d users`.
3. Full flow on a real Telegram client (iOS + Android): scratch card under touch, back-button
   behaviour inside the webview, 360–430 px widths.
4. Kill and reopen the Mini App mid-flow → resumes at the right step.
5. `SELECT * FROM promo_codes` after completion → one row per user, correct expiry.

These are listed as unchecked in the PR description rather than claimed as done.

---

## 8. Open decisions (need an answer before coding starts)

| # | Question | Recommendation |
|---|---|---|
| D1 | Where does the scoring service live — `backend/src/services/` or `shared/src/`? | `shared/src/scoring.js`, exported as `@dategram/shared/scoring`, so demo mode reuses the exact same math (C16) and there is one implementation to test. Backend service file becomes a thin re-export. |
| D2 | Promo code format | `DATEGRAM-7QK2MX` (C9). Alternative if marketing wants the spec's look: `DATEGRAM-OCT26-<4 random>`. |
| D3 | Promo discount and TTL | 50 % / 7 days, both env-configurable. |
| D4 | Email uniqueness / verification | Not unique, not verified in MVP; revisit with a partial unique index. |
| D5 | Is `results_completed` on `users` or `onboarding_progress`? | `users` — it gates the app shell, which reads `users`. |
| D6 | Does the main-app shell land on a real Discover screen in this phase? | No — Phase 5. Ship `AuthenticatedHome` renamed/relabeled as the shell placeholder so R6 has a visible destination. |
| D7 | R1b candidate-search simulation | Deferred (C17). |
| D8 | Claim copy sign-off (C18) | Owner + legal, out of code scope, tracked separately. |

---

## 9. Build order

Each increment ends green on `npm test` + `npm run build`, so each is independently
reviewable.

1. **Migrations + schema** — `migrate.js`, `0001_results_and_promo.sql`, `schema_migrations`
   test, `mapUser` extension. *Touches no runtime path yet.*
2. **Services** — `scoring.js` (shared), `promoService.js`, and their unit tests. Pure code,
   highest bug density per the corrections in §2.
3. **Results API** — `resultsRepository.js`, `results.routes.js`, app wiring,
   `resultsRoutes.test.js`. Verifiable end-to-end with `curl` + signed `initData`.
4. **Flow skeleton** — `results.api.js`, `useResultsFlow`, context, `ResultsFlow` page, the
   `App.jsx` three-way gate, demo store. Ends with R1→R6 navigable using plain placeholders.
5. **Screens R1–R5** — analyzing animation, score card + gradient bar, email, name, plan +
   extracted chart.
6. **R6 scratch card** — canvas, threshold, keyboard alternative, promo wiring, completion →
   main app.
7. **Docs** — `docs/PHASE_3_ARCHITECTURE.md` in the style of `PHASE_2_ARCHITECTURE.md`,
   README API table + status list + "Next phase" section updated.

---

## 10. Acceptance criteria — traceability

| Spec criterion | Where it is satisfied |
|---|---|
| Lands on analyzing after section 5 | C6 gate in `App.jsx`; `useOnboarding` untouched |
| Animation plays ~4 s regardless of API speed | §6 R1 — transition requires both timer and promise |
| Score from real answers | C1/C2 corrected keys; `scoringService.test.js` |
| Marker matches the number | §6 R2 — one `score` value drives both |
| Email skippable | §4.2 — `null` accepted, no `422` |
| Name required | §4.2 `422 INVALID_NAME` + disabled CTA |
| Name uppercased on plan heading | §6 R5 |
| Chart at 360–430 px | §6 R5, `viewBox`-based SVG (scales by construction) |
| Scratch works by touch | §6 R6 Pointer Events — **device test required, see §7** |
| Unique promo per user, stored | C9 + `UNIQUE` index + retry |
| `onboarding_completed = true` at the end | Already true at step 42; `results_completed` is the new gate (C6) |
| Lands on main app shell | §5.3 `onFinished` |
| Dark theme / pink / pills | §6 styling, existing tokens reused |
