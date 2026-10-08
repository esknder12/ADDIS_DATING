# Phase 3 Architecture — Post-Onboarding Results & Conversion

Phase 3 adds the six conversion screens that run between the last onboarding question and the
main app: analysis, match-potential result, optional email, required name, four-week plan, and
scratch-card discount.

The design decisions behind this implementation, including every place the original
specification was corrected, are recorded in
[`PHASE_3_IMPLEMENTATION_PLAN.md`](PHASE_3_IMPLEMENTATION_PLAN.md).

## Completion is two flags, not one

Phase 2 already set `users.onboarding_completed` on the final question, and `App.jsx` routed
straight to the main shell from that single flag — which would have skipped this flow entirely.
The gate is now three-way:

| Condition | Screen |
|---|---|
| `!onboardingCompleted` | `OnboardingFlow` (Phase 2, unchanged) |
| `onboardingCompleted && !resultsCompleted` | `ResultsFlow` (Phase 3) |
| `resultsCompleted` | main app shell |

`POST /api/onboarding/complete` keeps its Phase 2 meaning untouched. Phase 3 finalises through
`POST /api/onboarding/results/complete`, which additionally requires a stored name and sets
`results_viewed_at` once via `COALESCE`.

## Migrations

`schema.sql` is `CREATE ... IF NOT EXISTS` only, so it converges a fresh database but cannot
alter an existing one. Phase 3 is the first phase to add columns to a live table, so
`backend/src/db/migrate.js` introduces an additive channel:

- `schema_migrations(name, applied_at)` records what has run.
- Files in `backend/src/db/migrations/` are applied in filename order, each in its own
  transaction, at boot after `schema.sql`.
- Applied files are never rewritten.

`0001_results_and_promo.sql` adds the results columns to `users`, creates `promo_codes`
(`CITEXT` unique code), and enables the `citext` extension.

## Scoring is one shared, deterministic implementation

`shared/src/scoring.js` is exported as `@dategram/shared/scoring` and runs in both the API and
the browser, so demo mode cannot drift from production behaviour. It has no `node:crypto`
dependency: Vite externalises that import, and the call would throw at runtime, so the
fingerprints use portable FNV-1a hashes. Nothing here is a security boundary — the outputs are
marketing figures.

Guarantees, all covered by tests:

- Every signal reads a real answer key from `shared/src/onboarding.js`.
- The score is clamped to 65–97, so 100 and anything below 60 are unreachable.
- Jitter comes from `(secret, userId, answersHash)`, so a reload shows the same number.
- `users.answers_hash` records which answer set produced the stored score; the API returns the
  stored score unchanged until the answers actually change.
- The match pool is stable per `(user, city, ISO week)` rather than random per request.
- The response-rate multiplier is derived from the dating style, so label and number agree.

## Results API

All routes sit behind `createTelegramAuthMiddleware` and derive identity only from validated
`initData`. Mounted at `/api/onboarding/results`, registered before `/api/onboarding` so the
longer prefix wins.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/onboarding/results` | Resume payload; `409 SCORE_NOT_CALCULATED` before scoring |
| `POST` | `/api/onboarding/results/calculate-score` | Compute once, then return the stored score |
| `POST` | `/api/onboarding/results/email` | Save or clear the email; `null` is a valid skip |
| `POST` | `/api/onboarding/results/name` | Save the required name |
| `POST` | `/api/onboarding/results/promo` | Get-or-create the discount code |
| `POST` | `/api/onboarding/results/complete` | Set `results_completed`, return the user |

Email and name are validated on the server with the same rules the UI uses to enable its
buttons; the client never gets to decide.

## Promo codes

`backend/src/services/promoService.js` generates `DATEGRAM-` plus six characters from an
alphabet without `0/O/1/I`, using `crypto.randomBytes`. The route is get-or-create, so repeated
visits to the discount screen show the same code, and retries up to five times on a
`23505` unique violation before returning `409 NO_PROMO_AVAILABLE`. Discount and TTL come from
`PROMO_DISCOUNT_PERCENT` and `PROMO_TTL_DAYS`.

## Frontend flow control

There is no router library. `useResultsFlow` owns an ordered step machine
(`analyzing → score → email → name → plan → discount`) and mirrors the current step into
`location.hash` (`#r/name`), so the Telegram/Android back button moves one step back instead of
closing the Mini App. `resolveEntryStep` decides where a returning user lands, which is what
makes the flow resumable and stops a finished discount from replaying.

`OnboardingResultsContext` exposes `{results, status, error, submitting, step}`. Every mutation
returns the full results object and replaces local state, so no screen depends on props threaded
through the flow.

Stores are interchangeable behind one interface:

- `createResultsApiStore()` — Telegram users, six round-trips.
- `createResultsLocalStore()` — browser preview, same scoring maths, versioned LocalStorage key,
  never calls a protected endpoint.

## Screens

- **R1 `AnalyzingScreen`** — five rows from `onboardingSections` plus Match Potential, each
  filling over 800 ms. The transition waits for both the animation and the API, so a fast
  response never truncates it and a slow one never dead-ends it.
- **R2 `MatchScoreCard`** — `ScoreGradientBar` positions its marker from the same numeric score
  it displays, so dot and number cannot disagree. Falls back to an initials avatar while there
  is no photo upload.
- **R3 `EmailCaptureScreen`** — `CONTINUE` disabled until the regex matches; `SKIP THIS STEP`
  always available and posts `null`.
- **R4 `NameCaptureScreen`** — required, no skip, `CONTINUE` disabled under two characters.
- **R5 `MatchPlanScreen`** — reuses `MatchGrowthChart`, extracted from the Phase 2
  `match-growth` interstitial so the two charts cannot drift. Quotes the user's real
  `four_week_goal` answer and keeps both disclaimers.
- **R6 `ScratchCardScreen`** — custom canvas over `react-scratchcard-v2`.

## Scratch card

`useScratchReveal` drives a low-resolution alpha mask (64×40) scaled up by CSS, so
`getImageData` stays cheap on mobile. Pointer Events with `setPointerCapture` give one code path
for touch, mouse and pen; `touch-action: none` stops the webview stealing the stroke. Completion
fires at 60 % cleared, then fades the cover.

Product spec §16 rule 6 requires a non-canvas alternative, so the card always renders a visible
**Reveal my discount** button, announces progress through an `aria-live` region, and keeps the
prize `aria-hidden` until revealed. `prefers-reduced-motion` removes the fade and the row
animations. In jsdom, where `getContext` returns `null`, the card degrades to that button rather
than throwing — which is also the behaviour on a canvas-less browser.

## Testing

```
npm test     # backend: node --test   |   frontend: vitest run
npm run check
```

Backend suites cover the scoring maths and its determinism, promo generation and uniqueness, the
migration runner, the SQL the results repository emits, and every results route including auth,
validation, skip-email, promo idempotency and the completion guards. Frontend suites cover input
validation, the local store, `resolveEntryStep`, and the R2–R6 components including the marker
position and the keyboard reveal.

PostgreSQL is not available in the CI sandbox, so the repository suite pins the emitted SQL
against a recording pool instead. The live-database checks that still need a human are listed in
[`PHASE_3_IMPLEMENTATION_PLAN.md`](PHASE_3_IMPLEMENTATION_PLAN.md) §7.

## Claim copy

Award badges, the response-rate multiplier and the 2→12 match curve are gated by product spec
§16 rule 13 and must not ship publicly unsubstantiated. They match copy that already shipped in
Phase 2 and each illustrative figure keeps its disclaimer. Sign-off is a product/legal task, not
a code one.
