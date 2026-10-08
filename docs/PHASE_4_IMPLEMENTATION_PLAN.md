# Phase 4 Implementation Plan — Bot-Based Video Verification

Status: **implemented.** Built on branch `arena/80976817-addis-dating` using the defaults in §7
(token admin auth, verification card on the post-onboarding shell, streaming review endpoint,
plain CSS). The as-built record is in [`PHASE_4_ARCHITECTURE.md`](PHASE_4_ARCHITECTURE.md).

This document reconciles the externally drafted Phase 4 specification with the repository as it
exists now (Phase 1–3 implemented on `arena/80976817-addis-dating`, uncommitted in the working
tree). §1 is what I read and ran; §2 is where the pasted spec does not survive contact with it.

Scope (product spec §5, `docs/DATEGRAM_PRODUCT_SPEC.md`): V1 in-app modal → V2 bot instructions
→ V3 user video note → review → verified badge.

---

## 1. Verified starting point

Current gate: `npm test` → backend 72 pass / frontend 32 pass; `npm run build` → clean.

Facts that constrain the design:

| Fact | Evidence |
|---|---|
| The bot layer is 39 lines: `/start` only, grammY, long polling, returns `null` when `BOT_TOKEN`/`WEBAPP_URL` are missing | `backend/src/bot/bot.js:7-34` |
| **There is no `query()` helper.** `db/index.js` exports only `getDatabasePool`, `initDatabase`, `checkDatabase`, `closeDatabase` | `grep -n "^export" backend/src/db/index.js` → `NO query() export` |
| Migrations exist now and are the only additive schema channel | `backend/src/db/migrate.js`, `migrations/0001_results_and_promo.sql` |
| `users.is_verified BOOLEAN NOT NULL DEFAULT FALSE` **already exists** | `backend/src/db/schema.sql:23` |
| `mapUser` already exposes `isVerified` | `backend/src/db/userRepository.js` |
| Error contract is `{error:{code,message}}` everywhere | `auth.routes.js:40`, `onboarding.routes.js:41,57,64` |
| Routers build auth with `createTelegramAuthMiddleware(runtimeConfig)`, injected via `createApp({...})` | `app.js:24-31`, `results.routes.js` |
| **No Profile tab, no bottom nav, no tabs of any kind** | `grep -rn "Profile tab\|BottomNav\|tabs" frontend/src/` → empty |
| Tailwind is imported but **generates zero utilities** — every component uses hand-written CSS | `grep -c "bg-black\|inset-0" dist/assets/*.css` → `0` |
| `closeMiniApp()` exists; there is no `openTelegramLink` wrapper | `frontend/src/lib/telegram.js:42` |
| grammY is **1.46.0** | `node_modules/grammy/package.json` |

### The grammY finding, verified by running it

```
matchFilter('video_note')  → THREW "Invalid L1 filter 'video_note' given in 'video_note'.
                             Permitted values are: 'message', 'edited_message', ..."
matchFilter('message:video_note') → true
matchFilter(':video_note')        → true
```

`bot.on('video_note', …)` does not fail quietly. It throws during handler registration, i.e. at
`initBot()` on boot.

---

## 2. Spec corrections

C1–C4 are not style notes; each one stops the feature from working or opens a hole.

### C1 — `bot.on('video_note')` throws at boot

Verified above. Correct filter is `bot.on('message:video_note', …)`. As written, the API process
still starts (the bot is initialised after `app.listen`) but polling registration dies and no
video is ever captured.

### C2 — The handler reads Message fields off a grammY Context

The spec names its parameter `msg` and reads `msg.video_note`, `msg.message_id`, `msg.from.id`,
`msg.chat.id`. grammY passes a **Context**. Verified against `context.d.ts` and at runtime:

| Spec reads | Reality |
|---|---|
| `ctx.video_note` | `undefined` — it is `ctx.msg.video_note` |
| `ctx.message_id` | `undefined` — it is `ctx.msg.message_id` |
| `ctx.from.id` | works (Context getter) |
| `ctx.chat.id` | works (Context getter) |

So `videoNote.file_id` throws `TypeError: Cannot read properties of undefined`, which the
spec's own `try/catch` swallows into a `console.error`. **Verification would appear to be built
and would never record a single submission.** Correct: `ctx.msg.video_note`, `ctx.msg.message_id`.

### C3 — The admin endpoints ship with no authentication

`GET /api/admin/verification/pending`, `PATCH …/approve`, `PATCH …/reject` have no middleware.
The spec acknowledges this only in comments ("⚠️ Add proper admin auth middleware before
production use", "⚠️ protect this in production!"). Mounted as written, **any anonymous HTTP
client can list pending face videos and approve itself verified**, which destroys the entire
value of the badge and is the safety property Phase 5's swipe screen will rely on.

This is a blocking decision, not a TODO. Options in §7 D1. Recommendation: a static
`ADMIN_API_TOKEN` compared in constant time, admin Telegram-ID allowlist as the production
upgrade path. Ship the middleware with the endpoints, not after them.

### C4 — `query()` does not exist

Four files import `{ query } from '../../db/index.js'`. There is no such export. Phase 3's
convention is a repository factory taking the `pg` pool (`createResultsRepository(pool)`), which
is what makes the route tests possible without a database. Phase 4 follows that:
`createVerificationRepository(pool)`.

### C5 — `is_verified` already exists, and the spec's version would weaken it

`users.is_verified BOOLEAN NOT NULL DEFAULT FALSE` is already in `schema.sql:23`. The spec's
`ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE` is a harmless no-op, but if anyone
"fixes" it by dropping the `IF NOT EXISTS` they get a nullable column and every existing
`is_verified` check becomes three-valued. Drop the line; do not touch the column.

### C6 — Schema changes belong in migration `0002`, not raw `ALTER`s

Phase 3 added the runner precisely because `schema.sql` is `CREATE … IF NOT EXISTS` and can never
alter an existing table. Phase 4 must add `migrations/0002_verification.sql`. Appending `ALTER
TABLE` to `schema.sql` would re-run on every boot.

### C7 — There is no Profile tab for V1 to live in

The spec says V1 is "Triggered from Profile tab ('Get verified' row)". No tabs exist; Phase 5
builds Discover and the bottom nav. `AuthenticatedHome` is the current post-onboarding shell.
Decision needed (§7 D2). Recommendation: add a **Verification card to `AuthenticatedHome`** now,
built as a self-contained component that Phase 5 can lift into the Profile tab unchanged.

### C8 — Error shape

Spec returns `{ error: 'User not found' }`. Every existing route returns
`{ error: { code, message } }`, and `frontend/src/api/client.js` consumers read
`error.response?.data?.error?.message`. Use the repo shape.

### C9 — `req.app.get('bot')` vs. dependency injection, and the bot may be `null`

`initBot` returns `null` when `BOT_TOKEN` or `WEBAPP_URL` is unset — which is the default in
this repo's dev setup. The spec's `bot.sendMessage(...)` would throw `Cannot read properties of
null`. Inject a `verificationNotifier` through `createApp({...})` like every other dependency,
have it report availability, and return `503 BOT_UNAVAILABLE` when it is absent. This is also
what makes the routes testable without Telegram.

### C10 — The duplicate-submission logic contradicts its own acceptance criterion

Acceptance: *"Duplicate video note submissions while already verified/pending are ignored
gracefully."* The handler accepts both `pending_review` **and** `not_started`, and inserts a new
row every time, so:

- The "only accept if verification was actually requested" comment is false — `not_started`
  means it was never requested.
- Ten video notes before review produce ten `pending` rows.

Fix: a single open submission per user, enforced by a partial unique index
(`CREATE UNIQUE INDEX … ON verification_submissions (user_id) WHERE status = 'pending'`) plus an
`ON CONFLICT DO NOTHING`, so the guarantee lives in the database and not in application logic.

### C11 — Two states of truth, and `pending_review` set too early

The request handler sets `verification_status = 'pending_review'` before any video exists, then
the video handler sets it again. `GET /status` therefore reports "pending review" for a user who
has not recorded anything, and the UI cannot distinguish "waiting for you" from "waiting for us".
Introduce `requested` as its own value:

```
not_started → requested → pending_review → approved
                     ↘                     ↗
                        rejected → requested (retry)
```

### C12 — The polling hook has a side effect inside a state updater

```js
const interval = setInterval(() => {
  setStatus((current) => { if (current.status === 'pending_review') checkStatus(); return current; });
}, pollInterval);
```

A React state updater must be pure; `StrictMode` (enabled in `main.jsx:9`) invokes it twice, so
this double-fires the network call. It also polls forever regardless of state. Read from a ref,
poll only while `requested`/`pending_review`, stop on terminal states, and stop when the tab is
hidden.

### C13 — Rejection reason is never validated

`{ reason }` is used directly in `VERIFICATION_REJECTED_MESSAGE.replace('{reason}', reason)`. With
no body, the user receives **"Reason: undefined"**. Require a non-empty reason from a fixed
catalogue (blurry face, not a video selfie, face not visible, video too short, other) so the
message is always coherent and the data is analysable.

### C14 — Approve/reject are not transactional

Each does two separate `UPDATE`s. A failure between them leaves the submission approved and the
user unverified, with no way to notice. Phase 3's repositories already use
`BEGIN`/`FOR UPDATE`/`COMMIT`; do the same, and make both operations idempotent (re-approving an
approved submission returns success without re-notifying).

### C15 — The admin cannot actually see the video

The endpoints return `telegram_file_id`, but a `file_id` is opaque and useless without a
download. "MVP: call via Postman/curl" cannot work as specified — there is nothing to review. Add
`GET /api/admin/verification/:id/file`, which calls `getFile` and streams the file from
`https://api.telegram.org/file/bot<token>/<path>`. Without this, manual review means asking the
user to re-send the video somewhere else.

### C16 — `user_id INTEGER` against a `BIGSERIAL` parent

`users.id` is `BIGSERIAL`. `verification_submissions.user_id INTEGER` works until it doesn't. Use
`BIGINT`, matching `onboarding_answers.user_id`.

### C17 — `SERIAL`/`TIMESTAMP` vs. repo conventions

Use `BIGSERIAL` and `TIMESTAMPTZ`, as in every existing table.

### C18 — `telegramAuthMiddleware` singleton vs. factory

The singleton is bound to whatever `config` was at import time. Every existing router uses
`createTelegramAuthMiddleware(runtimeConfig)`. Use the factory.

### C19 — The example video `file_id` is bot-specific

Telegram `file_id`s are scoped to the bot that received them. `VERIFICATION_EXAMPLE_VIDEO_ID`
only works if the file was uploaded **through `@DategramAppBot`**. Document that, and make the
send optional and non-fatal — a bad ID must not break the instruction sequence.

### C20 — Tailwind is not the repo's styling system

The spec's `VerificationModal` is written in Tailwind utilities. Tailwind is imported
(`index.css:1`) but generates zero utilities today because no component uses them; every screen
uses hand-written CSS in `index.css`, `styles/onboarding.css`, `styles/results.css`. Introducing
utilities here creates two styling systems in one app. Recommendation: plain CSS in
`styles/verification.css`, reusing `.onboarding-primary`, `.sr-only`, focus and reduced-motion
patterns from Phase 3. (Tailwind *would* work — v4 scans sources — this is a consistency call,
not a capability one.)

### C21 — New routes need rate limiting

`/api/verification/request` triggers three outbound Telegram API calls including a pin. Every
existing router group has a limiter (`app.js:52,68,78`). Without one this is a free bot-spam
amplifier against the bot's own rate limits.

### C22 — Re-request after rejection never clears the old reason

`verification_rejection_reason` persists, so a user who retries and is approved still has a
rejection reason on their row. Clear it when a new submission is accepted.

### C23 — Retention of face video is unaddressed

A video note is biometric-adjacent personal data. Storing only the `file_id` (as the spec does)
is the right call — Dategram never holds the bytes. But there is no retention rule. Recommend:
record `telegram_file_id` only, never download-and-store, and add a scheduled purge of
`approved`/`rejected` submissions after N days. Flag for a privacy decision (§7 D5); the product
spec's rule 9 already commits to minimum-precision data handling.

### C24 — Long polling is single-instance

`bot.start()` uses long polling. Running two API instances means two pollers fighting over the
same updates. README already notes webhook delivery when scaling; Phase 4 does not change this,
but the review flow now depends on exactly-once bot delivery, so it is worth stating explicitly.

---

## 3. Data layer — `migrations/0002_verification.sql`

```sql
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'not_started'
    CHECK (verification_status IN
      ('not_started', 'requested', 'pending_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_rejection_reason TEXT;

-- is_verified already exists (schema.sql:23). Deliberately untouched.

CREATE TABLE IF NOT EXISTS verification_submissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  telegram_file_id TEXT NOT NULL,
  telegram_message_id BIGINT,
  duration_seconds INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by VARCHAR(255),
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS verification_submissions_user_idx
  ON verification_submissions (user_id);
CREATE INDEX IF NOT EXISTS verification_submissions_status_idx
  ON verification_submissions (status) WHERE status = 'pending';

-- One open submission per user, enforced by the database rather than by handler logic (C10).
CREATE UNIQUE INDEX IF NOT EXISTS verification_submissions_one_pending_per_user
  ON verification_submissions (user_id) WHERE status = 'pending';

COMMIT;
```

Deviations from the spec, all reasoned above: no `is_verified` line (C5), `BIGINT`/`BIGSERIAL`/
`TIMESTAMPTZ` (C16/C17), `CHECK` on both status columns (C11), partial unique index (C10),
partial index on `status` (the only query that filters by it asks for `pending`).

New `backend/src/db/verificationRepository.js`, following `resultsRepository.js`:
`getStatus`, `markRequested`, `recordSubmission`, `listPending`, `getSubmission`,
`approve`, `reject`. `approve`/`reject` run in a transaction with `FOR UPDATE` and return
`{status:'ok'|'not-found'|'already-reviewed'}`.

---

## 4. Backend

### 4.1 Bot layer

```
backend/src/bot/
├── bot.js                                  # existing; registerVerificationHandlers(bot, deps) called from initBot
├── messages/verificationMessages.js        # NEW: the five templates, verbatim from product spec §5
└── handlers/verificationHandler.js         # NEW: sendInstructions + registerVideoNoteHandler
```

`sendVerificationInstructions(notifier, { chatId, userId })`:

1. Send the pinned message with the `Return to Dategram 🖤` `web_app` button (`runtimeConfig.webappUrl`, never `process.env` — the repo validates config in `config/env.js`).
2. `pinChatMessage`. Per grammY's own type docs, pinning works in private chats without extra rights.
3. Optional `sendVideoNote(VERIFICATION_EXAMPLE_VIDEO_ID)` — wrapped so a bad or missing ID logs and continues (C19).
4. Send the instructions text.
5. `markRequested(userId)` → `verification_status = 'requested'` (C11).

Every Telegram call is individually `try`/`catch`ed and reported; a pin failure must not abort the sequence.

`registerVideoNoteHandler(bot, { verificationRepository, messages })`:

```js
bot.on('message:video_note', async (ctx) => {          // C1
  const videoNote = ctx.msg.video_note;                // C2
  const messageId = ctx.msg.message_id;                // C2
  const telegramId = ctx.from?.id;
  ...
});
```

- Unknown Telegram user → ignore silently (they never authenticated through the Mini App).
- `is_verified` already true, or status `approved` → ignore, no message (acceptance: duplicates ignored).
- Otherwise insert with `ON CONFLICT DO NOTHING` on the partial unique index; if it was a
  duplicate open submission, reply with a short "we already have your video" line rather than
  a second confirmation.
- Clear any stale `verification_rejection_reason` (C22), set `pending_review`, confirm receipt.

### 4.2 User-facing API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/verification/request` | Send the bot sequence, set `requested` |
| `GET` | `/api/verification/status` | `{isVerified, status, rejectionReason, submittedAt}` |

Both behind `createTelegramAuthMiddleware(runtimeConfig)` and a `10/min` limiter (C21).
`request` returns `503 BOT_UNAVAILABLE` when the bot is not configured (C9), and `409
ALREADY_VERIFIED` when `is_verified` is already true.

### 4.3 Admin API — authenticated from the first commit

```
backend/src/middleware/adminAuth.js      # NEW
backend/src/routes/admin.routes.js      # NEW
```

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/verification/pending` | Queue, oldest first |
| `GET` | `/api/admin/verification/:id/file` | Stream the video via `getFile` (C15) |
| `PATCH` | `/api/admin/verification/:id/approve` | Idempotent, transactional, notifies user |
| `PATCH` | `/api/admin/verification/:id/reject` | Requires a reason from the catalogue (C13) |

`adminAuth` middleware: `ADMIN_API_TOKEN` from config, compared with
`crypto.timingSafeEqual` (the repo already does this for Telegram hashes in
`telegramAuth.js:12-18`), rejecting with `401 {code:'ADMIN_UNAUTHORIZED'}`. Production upgrade:
allowlist of admin Telegram IDs validated through the same `initData` path. Rate limit `30/min`.

Admin routes are mounted only when `ADMIN_API_TOKEN` is set; otherwise the router is not
registered at all and the paths 404. That makes "forgot to configure it" fail closed rather than
open.

### 4.4 Notifier seam

`verificationNotifier` wraps `sendMessage`, `pinChatMessage`, `sendVideoNote`, `getFile` and
exposes `isAvailable`. Injected into `createApp({...})` and into `initBot`'s handler
registration. Tests substitute a recording fake — no Telegram, no network. This replaces
`req.app.get('bot')` (C9).

---

## 5. Frontend

```
frontend/src/
├── components/verification/
│   ├── VerificationModal.jsx        # V1
│   ├── VerifiedBadge.jsx            # reusable for Phase 5 swipe cards / chat headers
│   └── VerificationCard.jsx         # the host block on AuthenticatedHome (C7)
├── hooks/useVerificationStatus.js   # polling, fixed per C12
├── api/verification.api.js
└── styles/verification.css          # C20, imported in main.jsx after results.css
```

**V1 modal** — dimmed overlay, bottom sheet on mobile / centred above 640 px, circular photo with
blue check overlay, heading and copy verbatim from product spec §5, `💬 Video selfie` pill,
green **Get verified** CTA, close icon. On tap: `POST /api/verification/request`, then
`closeMiniApp()` (`lib/telegram.js:42`). Errors surface inline and re-enable the button — the
spec's version leaves the button permanently disabled on failure because `setLoading(false)`
runs but the user gets no message. `role="dialog"`, `aria-modal`, focus trap, `Esc` to close.

**Demo mode** — no API, no bot. `useVerificationStatus` returns a local state machine keyed on
LocalStorage, matching the Phase 3 pattern, and the modal shows a "preview only — the bot flow
needs Telegram" note instead of calling the endpoint.

**`useVerificationStatus`** — initial fetch, then poll every 5 s **only** while status is
`requested` or `pending_review`, stopping on `approved`/`rejected`, pausing on
`document.hidden`, reading current state from a ref rather than a state updater (C12). Exposes
`refetch()` for the "I just sent my video" case.

**`VerifiedBadge`** — plain CSS, size prop, `aria-label="Verified"`, reused by Phase 5.

---

## 6. Testing

### Automated, runnable here (no Postgres, no Telegram)

| File | Covers |
|---|---|
| `backend/test/verificationRepository.test.js` | emitted SQL, the one-open-submission conflict path, approve/reject transactions, idempotent re-approve |
| `backend/test/verificationRoutes.test.js` | auth 401, `503 BOT_UNAVAILABLE`, `409 ALREADY_VERIFIED`, status payload, limiter shape |
| `backend/test/adminRoutes.test.js` | **unauthenticated admin request is rejected**, wrong token rejected, approve notifies once, reject requires a valid reason, unknown id → 404, re-approve is idempotent |
| `backend/test/videoNoteHandler.test.js` | correct filter registered, Context accessors used, unknown user ignored, already-verified ignored, duplicate submission → single row |
| `frontend/src/hooks/useVerificationStatus.test.js` | polls only in non-terminal states, no double-fire, stops when hidden |
| `frontend/src/components/verification/verification.test.jsx` | modal renders spec copy, CTA disabled while loading, error re-enables it, badge renders |

A bot-handler test needs a fake grammY context; `matchFilter('message:video_note')` is asserted
directly so C1 cannot regress silently.

### Cannot be verified in this sandbox

No Postgres (no root: `apt-get` → `Permission denied`, uid 1001) and no Telegram bot token, so:

1. `0002_verification.sql` against a real Phase 3 database, and the partial unique index actually rejecting a second pending row.
2. The full loop with a real bot: request → pinned message → example video note → user video note → row appears.
3. `getFile` streaming a real video note.
4. V1 on a real device: modal over the Mini App, `closeMiniApp()` returning to the bot chat with the messages already delivered.
5. Badge visible after approval on a cold Mini App open.

These go in the PR description as unchecked, not as done.

---

## 7. Open decisions

| # | Question | Recommendation |
|---|---|---|
| D1 | Admin auth mechanism | `ADMIN_API_TOKEN` + constant-time compare now; Telegram-ID allowlist later. **Blocking — endpoints must not ship open (C3).** |
| D2 | Where does V1 live, given no Profile tab | Verification card on `AuthenticatedHome`, built to be lifted into Phase 5's Profile tab unchanged. |
| D3 | Review process | Manual via curl for MVP. The dashboard is Phase 12. Confirm the `:id/file` streaming endpoint is acceptable, since without it manual review is impossible (C15). |
| D4 | Rejection reason catalogue | Fixed list: blurry, not a selfie video, face not visible, too short, other. Free-text as an optional note alongside. |
| D5 | Retention of submission records | Purge `approved`/`rejected` rows after 30 days; never store video bytes, only `file_id` (C23). Needs a privacy sign-off. |
| D6 | Tailwind or plain CSS | Plain CSS, matching every existing screen (C20). |
| D7 | Example video note | Provide a `file_id` uploaded through `@DategramAppBot`, or ship without the example and text instructions only (C19). |

---

## 8. Build order

Each step ends green on `npm run check`.

1. **Migration + repository** — `0002_verification.sql`, `verificationRepository.js`, SQL tests. No runtime path yet.
2. **Messages + notifier seam** — templates, `verificationNotifier`, `adminAuth` middleware.
3. **Bot handlers** — `sendVerificationInstructions`, `registerVideoNoteHandler`, handler tests.
4. **User API** — `/api/verification/request`, `/status`, wiring, route tests.
5. **Admin API** — pending list, `:id/file`, approve, reject, tests including the unauthenticated case.
6. **Frontend** — `verification.api.js`, `useVerificationStatus`, `VerifiedBadge`, `VerificationModal`, `VerificationCard`, `verification.css`.
7. **Docs** — `docs/PHASE_4_ARCHITECTURE.md`, README API table + env vars + status list.

---

## 9. Acceptance criteria — traceability

| Spec criterion | Where satisfied |
|---|---|
| "Get verified" sends bot messages and exits the Mini App | §5 V1 + §4.1; `closeMiniApp()` |
| Bot pins "You're almost there!" with a return button | §4.1 step 1–2, `web_app` button from `runtimeConfig.webappUrl` |
| Bot sends instructional text | §4.1 step 4, copy verbatim from product spec §5 |
| Video note captured and stored with its `file_id` | §4.1 handler with C1/C2 fixed |
| Bot auto-confirms receipt | §4.1 handler |
| Approve sets `is_verified` and notifies | §4.3, transactional and idempotent |
| Reject records a reason and notifies | §4.3, reason validated (C13) |
| Reopening the Mini App shows the badge | §5 polling + cold-start `GET /status` |
| Duplicate submissions ignored gracefully | §3 partial unique index (C10) — database-enforced, not handler logic |
| Admin endpoints usable manually | §4.3 `:id/file` streaming (C15) — otherwise they are not |
