import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createNotificationHandler } from '../src/bot/handlers/notificationHandler.js';

function notificationPool(userRow) {
  const inserted = [];
  const queries = [];
  return {
    inserted,
    queries,
    async query(sql, values) {
      queries.push(sql);
      if (sql.includes('SELECT 1 FROM notifications_log')) return { rows: [] };
      if (sql.includes('SELECT recipient.telegram_id, recipient.is_vip')) return { rows: [userRow] };
      if (sql.includes('COALESCE(sender.name, sender.first_name')) {
        return { rows: [{ telegram_id: 123, sender_name: 'Aster' }] };
      }
      if (sql.includes('SELECT recipient.telegram_id,')) {
        return { rows: [{ telegram_id: 123, matched_name: 'Match Person' }] };
      }
      if (sql.includes('SELECT telegram_id FROM users')) return { rows: [{ telegram_id: 123 }] };
      if (sql.includes('INSERT INTO notifications_log')) {
        inserted.push(values);
        return { rows: [] };
      }
      throw new Error(`Unexpected notification SQL: ${sql}`);
    },
  };
}

describe('Telegram notification handler', () => {
  it('sends and pins a spoiler photo to a non-VIP liker recipient', async () => {
    const pool = notificationPool({
      telegram_id: 123,
      is_vip: false,
      vip_expires_at: null,
      liker_name: 'Aster',
      photo_url: 'https://cdn.example.test/aster.jpg',
    });
    const sent = [];
    const pinned = [];
    const bot = { api: {
      async sendPhoto(...args) { sent.push(args); return { message_id: 9 }; },
      async pinChatMessage(...args) { pinned.push(args); },
    } };
    const service = createNotificationHandler(pool, { webappUrl: 'https://dategram.example' });

    assert.equal(await service.sendLikedYouNotification(bot, '40', '41'), true);
    assert.equal(sent[0][0], 123);
    assert.equal(sent[0][1], 'https://cdn.example.test/aster.jpg');
    assert.equal(sent[0][2].has_spoiler, true);
    assert.match(sent[0][2].caption, /Someone just liked you/);
    assert.doesNotMatch(sent[0][2].caption, /Aster/);
    const likesUrl = sent[0][2].reply_markup.inline_keyboard[0][0].web_app.url;
    assert.equal(new URL(likesUrl).searchParams.get('tab'), 'likes');
    assert.deepEqual(pinned, [[123, 9]]);
    assert.equal(pool.inserted[0][1], 'liked_you');
  });

  it('identifies the liker to an active VIP recipient without a spoiler', async () => {
    const pool = notificationPool({
      telegram_id: 123,
      is_vip: true,
      vip_expires_at: new Date(Date.now() + 60_000),
      liker_name: 'Aster',
      photo_url: 'https://cdn.example.test/aster.jpg',
    });
    const sent = [];
    const bot = { api: {
      async sendPhoto(...args) { sent.push(args); return { message_id: 10 }; },
      async pinChatMessage() {},
    } };
    const service = createNotificationHandler(pool, { webappUrl: 'https://dategram.example' });

    assert.equal(await service.sendLikedYouNotification(bot, '40', '41'), true);
    assert.equal(sent[0][2].has_spoiler, false);
    assert.match(sent[0][2].caption, /Aster just liked you/);
  });

  it('sends match notifications and logs the recipient-specific event', async () => {
    const pool = notificationPool({});
    const sent = [];
    const bot = { api: {
      async sendMessage(...args) { sent.push(args); return { message_id: sent.length }; },
    } };
    const service = createNotificationHandler(pool, { webappUrl: 'https://dategram.example' });

    assert.equal(await service.sendMatchNotification(bot, '40', '41', '99'), true);
    assert.equal(sent.length, 1);
    assert.match(sent[0][1], /It's a match/);
    const matchUrl = sent[0][2].reply_markup.inline_keyboard[0][0].web_app.url;
    assert.equal(new URL(matchUrl).searchParams.get('tab'), 'chat');
    assert.equal(new URL(matchUrl).searchParams.get('matchId'), '99');
    assert.equal(pool.inserted[0][1], 'new_match');
    assert.equal(pool.inserted[0][2], '41');
  });

  it('sends a bot DM with the conversation deeplink for an offline chat recipient', async () => {
    const pool = notificationPool({});
    const sent = [];
    const bot = { api: {
      async sendMessage(...args) { sent.push(args); return { message_id: 27 }; },
    } };
    const service = createNotificationHandler(pool, { webappUrl: 'https://dategram.example' });

    assert.equal(await service.sendMessageNotification(bot, '20', '21', '99', 'Hello there'), true);
    assert.equal(sent[0][0], 123);
    assert.match(sent[0][1], /Aster/);
    assert.match(sent[0][1], /Hello there/);
    const messageUrl = sent[0][2].reply_markup.inline_keyboard[0][0].web_app.url;
    assert.equal(new URL(messageUrl).searchParams.get('tab'), 'chat');
    assert.equal(new URL(messageUrl).searchParams.get('matchId'), '99');
    assert.equal(pool.inserted[0][1], 'chat_message');
    assert.equal(pool.inserted[0][2], '21');
    assert.match(pool.queries.find((sql) => sql.includes('COALESCE(sender.name')),
      /notificationsEnabled/);
  });

  it('respects a recipient’s disabled chat notification setting', async () => {
    let sent = false;
    const pool = {
      async query(sql) {
        if (sql.includes('COALESCE(sender.name')) return { rows: [] };
        throw new Error(`Unexpected notification SQL: ${sql}`);
      },
    };
    const service = createNotificationHandler(pool, { webappUrl: 'https://dategram.example' });
    const bot = { api: { async sendMessage() { sent = true; return { message_id: 1 }; } } };
    assert.equal(await service.sendMessageNotification(bot, '20', '21', '99', 'Hello'), false);
    assert.equal(sent, false);
  });
});
