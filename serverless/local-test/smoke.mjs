#!/usr/bin/env node
// Dategram Serverless smoke test — runs the REAL tgcloud/ modules on your
// laptop with an in-memory database and a recording Bot API. No Telegram,
// no token, no network needed.
//
//   cd serverless
//   node local-test/smoke.mjs     -> all PASS = safe to `npx tgcloud push`

import { register } from 'node:module';

register('./sdk-loader.mjs', import.meta.url);

const failures = [];
let passed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

function lastCall(apiCalls, method) {
  const found = apiCalls.filter((call) => call.method === method);
  return found[found.length - 1];
}

// Dynamic imports AFTER register() so the sdk shims apply.
const schema = await import('../tgcloud/schema.js');
const { apiCalls, __resetApi, EndpointError } = await import('./sdk-shim.mjs');
const { db } = await import('./sdk-db-shim.mjs');
const { default: onMessage } = await import('../tgcloud/handlers/message.js');
const { default: onCallback } = await import('../tgcloud/handlers/callback_query.js');
const { default: botStatus } = await import('../tgcloud/endpoints/botStatus.js');
const config = await import('../tgcloud/lib/config.js');
const text = await import('../tgcloud/lib/text.js');
const users = await import('../tgcloud/lib/users.js');
const notifications = await import('../tgcloud/lib/notifications.js');

console.log('\n[1/5] schema + config');
const expectedTables = [
  'users', 'photos', 'verificationRequests', 'notificationsLog', 'flags',
  'onboardingAnswers', 'onboardingProgress', 'swipes', 'matches', 'messages',
  'giftTransactions', 'premiumOrders', 'aiPicksSessions', 'aiPickItems',
  'profileBoosts', 'userPresence',
];
for (const name of expectedTables) {
  check(`table ${name}`, Boolean(schema[name]?.__table));
}
check('WEBAPP_URL is https', config.WEBAPP_URL.startsWith('https://'), config.WEBAPP_URL);
check('BOT_USERNAME targets test bot', config.BOT_USERNAME === 'addisdatingtest_Bot', config.BOT_USERNAME);
check('bridge off (standalone)', config.isBridgeEnabled() === false);

console.log('\n[2/5] message handler');
const msg = (overrides = {}) => ({
  message_id: 1,
  chat: { id: 777 },
  from: { id: 777, first_name: 'Selam', username: 'selam' },
  ...overrides,
});
const ctx = { update: { update_id: 1 } };

__resetApi();
await onMessage(msg({ text: '/start' }), ctx);
check('/start sends welcome', lastCall(apiCalls, 'sendMessage')?.params.text === text.WELCOME_MESSAGE);
check('/start sets menu button', apiCalls.some((c) => c.method === 'setChatMenuButton'));
check('/start mirrors user', (await users.getByTelegramId(777))?.firstName === 'Selam');

__resetApi();
await onMessage(msg({ text: '/start verify' }), ctx);
check('/start verify adds instructions', apiCalls.some(
  (c) => c.method === 'sendMessage' && c.params.text === text.VERIFICATION_INSTRUCTIONS,
));

for (const [command, expected] of [
  ['/verify', text.VERIFICATION_INSTRUCTIONS],
  ['/help', text.HELP_MESSAGE],
  ['/about', text.ABOUT_MESSAGE],
  ['/vip', text.VIP_INFO_MESSAGE],
  ['/app', text.WELCOME_MESSAGE],
  ['/nope', text.UNKNOWN_COMMAND_MESSAGE],
]) {
  __resetApi();
  await onMessage(msg({ text: command }), ctx);
  check(`${command} answers`, apiCalls.some(
    (c) => c.method === 'sendMessage' && c.params.text === expected,
  ));
}

__resetApi();
await onMessage(msg({ text: 'hello there' }), ctx);
check('plain text fallback', lastCall(apiCalls, 'sendMessage')?.params.text === text.PLAIN_TEXT_REPLY);

__resetApi();
await onMessage(msg({ video_note: { file_id: 'FILE123' } }), ctx);
check('video note acknowledged', lastCall(apiCalls, 'sendMessage')?.params.text === text.VERIFICATION_RECEIVED);
check('video note stored', (await db.select().from(schema.verificationRequests).all()).length === 1);
check('user pending verification', (await users.getByTelegramId(777))?.verificationStatus === 'pending');

console.log('\n[3/5] callback handler');
__resetApi();
await onCallback({ id: 'q1', data: 'vip', message: { message_id: 5, chat: { id: 777 } } }, ctx);
check('vip button edits text', lastCall(apiCalls, 'editMessageText')?.params.text === text.VIP_INFO_MESSAGE);
check('callback always answered', apiCalls.some((c) => c.method === 'answerCallbackQuery'));

__resetApi();
await onCallback({ id: 'q2', data: 'bogus', message: { message_id: 5, chat: { id: 777 } } }, ctx);
check('unknown callback still answered', apiCalls.some((c) => c.method === 'answerCallbackQuery'));

console.log('\n[4/5] botStatus endpoint');
let threwEndpointError = false;
try {
  await botStatus({}, {});
} catch (error) {
  threwEndpointError = error instanceof EndpointError;
}
check('missing initData throws EndpointError', threwEndpointError);

const stranger = await botStatus({}, { initData: { user: { id: 555 } } });
check('unknown user -> found:false', stranger.found === false);

await users.upsertFromTelegram({ id: 555, first_name: 'Dawit' });
const known = await botStatus({}, { initData: { user: { id: 555 } } });
check('known user -> found:true', known.found === true && known.verificationStatus === 'none');

console.log('\n[5/5] notifications');
db.__reset();
__resetApi();
check('like sent', await notifications.sendLikedYouNotification(111, 222) === true);
check('like uses text fallback standalone', lastCall(apiCalls, 'sendMessage')?.params.text.includes('Someone just liked you') === true);
check('like pinned', apiCalls.some((c) => c.method === 'pinChatMessage'));
check('like deduped (24h)', await notifications.sendLikedYouNotification(111, 222) === false);
check('match sent', await notifications.sendMatchNotification(111, 222, 9) === true);
check(
  'match deep-links to chat',
  JSON.stringify(lastCall(apiCalls, 'sendMessage')?.params.reply_markup).includes('matchId'),
);
check('chat DM sent', await notifications.sendMessageNotification(111, 222, 9, 'hello!!') === true);
check('VIP campaign sent', await notifications.sendVipGrantedNotification(111) === true);
check('4 log rows (dedup blocked repeat)', (await db.select().from(schema.notificationsLog).all()).length === 4);

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log(`Failed: ${failures.join(', ')}`);
  process.exit(1);
} else {
  console.log('All green — safe to `npx tgcloud push`.');
}
