// Runtime configuration for the Serverless bot.
//
// tgcloud modules have NO environment variables / secret store (CLI v0.2.x),
// so every setting lives here as a plain constant. Edit the values, then
// `npx tgcloud push` to deploy them with your code.

// --- DEPLOY TARGET: TEST BOT -----------------------------------------------
// BotFather bot: @addisdatingtest_Bot (sandbox).
// Live bot (@addisdating_Bot) stays on the main backend until cutover day.
// Cutover checklist: `npx tgcloud login` against the live bot, set
// BOT_USERNAME below to 'addisdating_Bot', re-check WEBAPP_URL,
// then `npx tgcloud push` + `npx tgcloud migrate`.
export const BOT_USERNAME = 'addisdatingtest_Bot';
export const BOT_DISPLAY_NAME = 'addisdating (test)';

// Public HTTPS URL of the Dategram Mini App frontend. Used for every
// "Open Dategram" web_app button and for the persistent menu button.
export const WEBAPP_URL = 'https://addisdating.vercel.app/';

// Label of the persistent menu button (set once, see lib/setup.js).
export const MENU_BUTTON_TEXT = 'Open Dategram';

// Base URL of the MAIN Dategram backend (Express + PostgreSQL).
// Hybrid mode: verification videos and profile lookups are forwarded there.
// Leave '' to run standalone — the bot still works, using its own SQLite
// mirror with generic fallbacks ("Someone just liked you!").
// Example: 'https://api.dategram.example.com'
export const DATEGRAM_API_URL = '';

// Optional shared secret sent as `x-bridge-key` to the main backend's
// bridge endpoints. Only needed if you configure the same secret there
// (see serverless/README.md "Bridge endpoints"). Keep it out of screenshots.
export const DATEGRAM_BRIDGE_KEY = '';

// Notifications of the same (user, type, related user) are sent at most once
// per window — mirrors the Postgres `notifications_log` 24h rule.
export const DEDUP_WINDOW_HOURS = 24;

// Chat-message DM preview length (characters, unicode-safe).
export const CHAT_PREVIEW_LENGTH = 72;

export function isWebappConfigured() {
  return typeof WEBAPP_URL === 'string' && WEBAPP_URL.startsWith('https://');
}

export function isBridgeEnabled() {
  return typeof DATEGRAM_API_URL === 'string' && DATEGRAM_API_URL.startsWith('https://');
}
