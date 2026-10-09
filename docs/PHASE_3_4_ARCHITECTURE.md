# Phase 3 + Phase 4 architecture

Phase 3 delivers the post-onboarding conversion funnel (spec section 4), Phase 4 the
main dating app (spec sections 5–13). Both follow the Phase 2 rule that behavior is
config-driven and validated on the server.

## Flow map

```
Splash ──▶ OnboardingFlow ──▶ ResultsFlow ──▶ MainApp
          (not completed)     (not converted)  (five tabs)
```

`App.jsx` derives the stage from `user.onboardingCompleted` and
`user.conversionCompleted`; demo users hydrate both flags from localStorage so the
browser preview resumes correctly across reloads.

## Phase 3 — results (`shared/src/results.js`)

- `resultsFlow` — ordered screen config for analysis, candidate search, result card,
  email, name, four-week plan, scratch discount. UI renders by `kind`, never a switch.
- `computeMatchResult(answers)` — pure, deterministic. The frontend uses it for instant
  rendering; the API recomputes it from persisted answers (never trusting the client).
- Validators `validateDisplayName` / `validateEmail` / `validatePromoCode` are shared by
  client and `/api/app/conversion` + `/api/app/discount`.

API routes (all `tma`-authenticated, `backend/src/routes/app.routes.js`):

| Route | Notes |
|---|---|
| `GET /api/app/results` | 409 `ONBOARDING_INCOMPLETE` until onboarding closes |
| `POST /api/app/conversion` | validates name + optional email, stores recomputed results |
| `POST /api/app/discount` | promo whitelist (`dategram_oct26` → 50%) |

## Phase 4 — main app (`shared/src/catalog.js` + `backend/src/db/appRepository.js`)

### Data model

`swipes` (unique user+profile), `matches` (unique user+profile), `messages`,
`gift_transactions` (unique user+client_ref → idempotent replays), `premium_orders`,
`verification_requests`, plus `users.results/promo/verification_status` columns.

### Safety invariants (spec rule 11 / 14)

- A match row exists **only** when my like meets the other side's like.
- `POST /matches/:id/messages` verifies the match belongs to the caller; anything else
  gets 403 `MATCH_REQUIRED`. Direct message buttons open the VIP paywall — the
  mutual-match rule is never bypassed by money.
- Gift and premium writes are idempotent; production must confirm Telegram Stars
  invoices server-side before fulfillment (marked in code comments).

### Demo catalog and browser mode

Discover, Likes, matches, chat, and gifts run on a small owned catalog
(`shared/src/catalog.js`, locally generated imagery) so the product logic is real
end-to-end. The browser demo mode (`frontend/src/lib/demoStore.js`) mirrors every API
route against localStorage with identical semantics — including the mutual-like match
rule and simulated partner replies.

### Bot verification (spec section 5)

- In-app modal (`VerificationModal`) explains the video-selfie flow.
- `/verify` bot command sends the nudge + round-video instructions.
- `video_note` messages store the file reference and set `verification_status='pending'`;
  a later moderation step flips `is_verified`.

### Frontend structure

```
pages/MainApp.jsx            tab + overlay orchestration (data via hooks/useAppData.js)
components/app/
  BottomNavBar, EmptyState, icons
  DiscoverTab, SwipeCard                gestures + action parity
  AiPicksTab, LikesTab, ChatTab, ChatThread
  ProfileTab (settings sheets), ProfileDetailSheet (gift shop)
  PaywallSheet, VerificationModal, MatchOverlay
pages/ResultsFlow.jsx        Phase 3 screen sequence
components/results/          AnalysisScreens, ResultScreens, ScratchScreen (canvas + tap alt)
```

All interactive controls use real buttons, 44px+ targets, `prefers-reduced-motion`
support, haptics via the existing Telegram helpers, and safe-area padding.
