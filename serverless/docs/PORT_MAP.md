# Port map — Express/grammY → Serverless

Every bot feature of the main backend and where its twin lives in this
project. The main backend (`backend/`) is **untouched** — this is a
JavaScript-only clone that runs on Telegram's infrastructure.

## Inbound bot (was: grammY polling in `backend/src/bot/bot.js`)

| Main backend | Serverless twin | Notes |
|---|---|---|
| `setChatMenuButton` (web_app) | `tgcloud/lib/setup.js` → `ensureMenuButton()`, called lazily from `/start` | Idempotent via `flags` table. Alternative: set it in @BotFather → Menu Button |
| `bot.command('start')` + welcome + web_app button | `tgcloud/handlers/message.js` (`/start`) + `tgcloud/lib/text.js` `WELCOME_MESSAGE` | Same wording. Adds main menu + `?start=verify` deep link |
| `bot.command('verify')` nudge + instructions | `message.js` (`/verify`) + `VERIFICATION_NUDGE` / `VERIFICATION_INSTRUCTIONS` | Same wording |
| `bot.on('message:video_note')` → `submitVerificationVideo` | `message.js` video-note branch → `verification_requests` + `users.verificationStatus='pending'` + bridge forward | Same idempotency rule (one row per user+file) |
| `bot.start()` long polling | *Deleted by design* | The platform manages the webhook from `handlers/` — no polling process exists |

New in Serverless (no main-backend equivalent): `/help`, `/about`, `/vip`,
`/app`, plain-text fallback, `handlers/callback_query.js` menu navigation.

## Notifications (was: `backend/src/bot/handlers/notificationHandler.js`)

| Main backend | Serverless twin | Notes |
|---|---|---|
| `sendLikedYouNotification` (photo spoiler for non-VIP, pin) | `tgcloud/lib/notifications.js` → same name | Same caption rule; photo from bridge, else mirror, else text-only |
| `sendMatchNotification` (`?tab=chat&matchId=`) | same file → same name | Same text + deep link |
| `sendMessageNotification` (offline DM, 72-char preview, honors `notificationsEnabled`) | same file → same name | Same preview slicing (`Array.from`, unicode-safe) |
| `sendVipGrantedNotification` (campaign + pin) | same file → same name | Same `VIP_CAMPAIGN_MESSAGE` |
| 24h dedup via `notifications_log` | `alreadySent` / `logNotification` on SQLite `notifications_log` | Same window (`DEDUP_WINDOW_HOURS`) |
| `pinChatMessage` best-effort | `pinIfPossible` | Same swallow-and-warn |
| Trigger after swipe (`routes/swipeNotifications.js`) | *Stays on main backend* | Express keeps calling its own notifier; see "Cutover" in README |
| Trigger on offline chat (`socket/chatEvents.js`) | *Stays on main backend* | Same as above |
| Trigger on admin VIP grant (`routes/admin.routes.js`) | *Stays on main backend* | Same as above |

New in Serverless: 403 "bot blocked" handling marks the mirror row inactive.

## Database (was: `backend/src/db/schema.sql`, PostgreSQL)

`tgcloud/schema.js` mirrors all 16 tables in SQLite form (no FKs — platform
rule; enforced in code instead):

- **Used now:** `users`, `photos`, `verificationRequests`,
  `notificationsLog`, `flags` (new: one-time setup state).
- **Reserved:** `onboardingAnswers`, `onboardingProgress`, `swipes`,
  `matches`, `messages`, `giftTransactions`, `premiumOrders`,
  `aiPicksSessions`, `aiPickItems`, `profileBoosts`, `userPresence` —
  deployed with the schema so future `endpoints/` can migrate Mini App
  features without a reshape.

## Mini App RPC (new surface)

| Feature | Module |
|---|---|
| Bot-side status for the caller (verification, VIP, notification prefs) | `tgcloud/endpoints/botStatus.js` → `POST /api/botStatus` via `Telegram.WebApp.Serverless.call('botStatus', …)` |

## Deliberately NOT ported (stays on the main backend)

- Express REST API (`/api/discovery`, `/api/swipe`, …) — needs Postgres
  transactions + the full query layer.
- Socket.IO real-time chat — V8 isolates cannot hold connections.
- Photo uploads (multer + Cloudinary) — needs npm + binary upload from client.
- Rate limiting / helmet / CORS — Express concerns; the platform verifies
  `initData` for `endpoints/` and isolates handlers by design.
