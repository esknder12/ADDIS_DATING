# Phase 4 Architecture — Bot-Based Video Verification

Phase 4 adds Telegram-native video verification: the Mini App asks the bot to send instructions,
the user replies with a round video note, and a reviewer approves or rejects it. The badge then
appears in the Mini App.

Every correction made against the original specification, with the evidence, is recorded in
[`PHASE_4_IMPLEMENTATION_PLAN.md`](PHASE_4_IMPLEMENTATION_PLAN.md). This is the as-built record.

## Why the bot and not the browser

Verification deliberately uses Telegram's native video-note capture instead of a camera API. The
Mini App holds no camera permission, no media bytes and no capture UI — it only triggers the bot
and then closes itself into the chat.

## Two grammY corrections that decide whether this works at all

Both were verified against the installed grammY 1.46.0 rather than assumed:

```
matchFilter('video_note')         → THROWS "Invalid L1 filter 'video_note'"
matchFilter('message:video_note') → true
```

- The filter is `message:video_note`. `bot.on('video_note')` throws during registration.
- grammY passes a **Context**, not a Message. The video note is `ctx.msg.video_note` and the id
  is `ctx.msg.message_id`. `ctx.video_note` and `ctx.message_id` are `undefined`.

`videoNoteHandler.test.js` asserts the filter with `matchFilter` and asserts the `ctx.msg`
accessors, so neither regression can return silently.

## Data model

`migrations/0002_verification.sql`:

- `users.verification_status` — `not_started → requested → pending_review → approved | rejected`,
  constrained by a `CHECK`. `is_verified` already existed as `NOT NULL DEFAULT FALSE` and is
  deliberately untouched.
- `verification_submissions` — one row per video note. Stores only Telegram's `file_id`; Dategram
  never holds the video bytes.
- A **partial unique index** on `(user_id) WHERE status = 'pending'` guarantees one open
  submission per user at the database level. A duplicate video note resolves through
  `ON CONFLICT DO NOTHING`, so the rule cannot be broken by a race in handler logic.

`requested` is its own state rather than reusing `pending_review`, so the UI can distinguish
"waiting for you to record" from "waiting for us to review".

## Bot layer

```
backend/src/bot/
├── bot.js                              # registers the video-note handler when dependencies exist
├── messages/verificationMessages.js    # copy verbatim from product spec §5, plus the reason catalogue
├── verificationNotifier.js             # seam over the bot; reports isAvailable
└── handlers/verificationHandler.js     # sendVerificationInstructions + registerVideoNoteHandler
```

`sendVerificationInstructions` sends the pinned message with the `Return to Dategram 🖤` web-app
button, pins it, optionally sends the example video note, then sends the instructions. **Each
Telegram call is isolated**: a pin failure or a bad example `file_id` (Telegram file IDs are
bot-scoped and easy to get wrong) is recorded in `failures` and the sequence continues. Only a
failure to send the first or last message aborts.

`registerVideoNoteHandler` ignores unknown senders and already-verified users without messaging
them, replies to a duplicate with distinct copy, and never lets a repository error escape into
the bot loop.

The notifier is injected rather than reached through `req.app.get('bot')`. `initBot` returns
`null` when `BOT_TOKEN`/`WEBAPP_URL` are unset, so routes ask `isAvailable` first and return
`503 BOT_UNAVAILABLE` instead of dereferencing null. In `server.js` routes hold a stable
`notifierRef` that is bound once polling starts.

## User API

| Method | Path | Behaviour |
|---|---|---|
| `POST` | `/api/verification/request` | Sends the sequence, sets `requested`. `503` if the bot is unconfigured, `409 ALREADY_VERIFIED` if already verified, `502` if Telegram is unreachable. |
| `GET` | `/api/verification/status` | `{isVerified, status, rejectionReason, requestedAt, reviewedAt}` for polling. |

Both sit behind `createTelegramAuthMiddleware(runtimeConfig)` and a `10/min` limiter, because each
request fans out to three outbound Telegram calls including a pin.

## Admin API — authenticated from the first commit

The specification shipped these endpoints with no middleware, only `⚠️` comments. Mounted that way
any anonymous client could list pending face videos and approve itself verified, which would make
the badge worthless. They are gated:

- `adminAuth` compares a `Bearer` token with `crypto.timingSafeEqual`, mirroring how
  `telegramAuth.js` compares signature hashes.
- **The router is only mounted when `ADMIN_API_TOKEN` is set.** An unconfigured deployment 404s
  rather than opening up.
- `30/min` limiter.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/verification/pending` | Queue, oldest first, bounded limit |
| `GET` | `/api/admin/verification/:id/file` | Streams the video via `getFile` |
| `PATCH` | `/api/admin/verification/:id/approve` | Transactional, idempotent, notifies once |
| `PATCH` | `/api/admin/verification/:id/reject` | Requires a catalogue reason, notifies once |

The streaming endpoint exists because a `file_id` is opaque — without it, "review via curl" is
not actually possible. It sets `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`,
and `fetchImpl` is injected so it is testable without network access.

Approval and rejection run in a transaction with `FOR UPDATE` on the submission row. A second
review returns `409 ALREADY_REVIEWED` and does **not** notify the user again. If the bot
notification fails after the review commits, the endpoint still returns `success: true` with
`notified: false` and a warning — a committed decision must not be reported as failed.

Rejection reasons come from a fixed catalogue (`REJECTION_REASONS`), so the user always receives a
sentence and never `Reason: undefined`.

## Frontend

```
frontend/src/
├── components/verification/
│   ├── VerificationModal.jsx     # V1: dialog, focus trap, Esc, error recovery
│   ├── VerificationCard.jsx      # host block; owns its own polling
│   └── VerifiedBadge.jsx         # reusable for Phase 5 swipe cards and chat headers
├── hooks/useVerificationStatus.js
├── api/verification.api.js
└── styles/verification.css
```

**V1** follows product spec §5: dimmed overlay, bottom sheet on mobile and centred above 640 px,
circular photo with the badge preview, the specified heading and copy, the `💬 Video selfie`
pill, and a green **Get verified** CTA. It traps focus, closes on `Esc` and on backdrop click,
and on success calls `closeMiniApp()` so the user lands in the bot chat where the messages have
already arrived. On failure it re-enables the button and shows the reason — the specified version
left the button permanently disabled with no message.

**`VerificationCard`** is the V1 host. There is no Profile tab yet (Phase 5 builds the tabs), so
the card sits on `AuthenticatedHome` and is written to be lifted into the Profile tab unchanged:
it owns its polling and state and needs nothing from its parent but the user identity.

**`useVerificationStatus`** polls only while status is `requested` or `pending_review`, stops on
terminal states, and pauses while `document.hidden`. It reads current state from a ref, not from
inside a state updater — a React updater must be pure and `StrictMode` invokes it twice, which
would double every request.

Styling is hand-written CSS, matching every other screen. Tailwind is imported but generates no
utilities anywhere in this repo; introducing them here would create two styling systems.

**Demo mode** has no bot, so the card writes a local status under
`dategram:verification:v1:<telegramId>` and the modal says plainly that the video is recorded in
the bot chat and needs Telegram. It never pretends an approval happened.

## Testing

```
npm test     # backend: node --test   |   frontend: vitest run
npm run check
```

Backend suites cover the emitted SQL and transaction boundaries, the one-open-submission conflict
path, idempotent review, the instruction sequence including pin and example-video failures, the
video-note handler's filter and accessors, user-route auth and error codes, and the admin routes
— including the unauthenticated request that must be rejected.

Frontend suites cover polling behaviour (terminal stop, hidden-tab pause, no double-fire), demo
state, and the modal, card and badge.

A Phase 3 test was found to be flaky while this phase landed: it asserted 10,000 random promo
codes were all unique, but that space has a ~4.7 % birthday-collision chance. It is now a
deterministic injectivity test over the alphabet mapping, plus a separate alphabet-coverage test.

## Not verified in this sandbox

No PostgreSQL (no root: `apt-get` → `Permission denied`, uid 1001) and no Telegram bot token.
Unchecked, and listed as such rather than claimed:

1. `0002_verification.sql` against a real database, and the partial unique index actually
   rejecting a second pending row.
2. The full loop with a real bot: request → pinned message → example video note → user video
   note → row appears → confirmation.
3. `getFile` streaming a real video note to a reviewer.
4. V1 on a real device: modal over the Mini App and `closeMiniApp()` returning to the bot chat
   with the messages already delivered.
5. Badge appearing after approval on a cold Mini App open.

What *was* checked live: the API boots with the new routers, `/api/verification/*` requires
`initData`, `/api/admin/*` rejects anonymous and wrong-token requests with `401`, reaches its
handler with the correct token, and unknown paths still 404.

## Operational notes

- `ADMIN_API_TOKEN` is required to enable the admin router. Production upgrade path: allowlist
  admin Telegram IDs through the existing signed-`initData` validation.
- `VERIFICATION_EXAMPLE_VIDEO_ID` is optional. A `file_id` is bot-scoped — it must have been
  uploaded through `@DategramAppBot` or the send will fail (logged, non-fatal).
- Long polling is single-instance. Two API processes means two pollers competing for the same
  updates; switch to webhook delivery before scaling out.
- Only `file_id` is stored, never video bytes. A retention rule for reviewed submissions still
  needs a privacy decision — see the plan's §7 D5.
