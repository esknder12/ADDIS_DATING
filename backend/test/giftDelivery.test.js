import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createNotificationHandler } from '../src/bot/handlers/notificationHandler.js';
import { createAppRepository } from '../src/db/appRepository.js';

function userRowQuery(rows) {
  return { rows };
}

function mockPool({ onQuery } = {}) {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return onQuery(sql, values, calls);
    },
  };
  return {
    calls,
    pool: {
      async query(sql, values) {
        calls.push({ sql, values });
        return onQuery(sql, values, calls);
      },
      async connect() {
        return { ...client, release() {} };
      },
    },
  };
}

const gift = { id: 'rose', label: 'Rose', icon: '🌹', stars: 31 };

describe('gift delivery (real gifts)', () => {
  it('findGiftRecipient resolves real recipients, never self or ghosts', async () => {
    const { pool } = mockPool({
      onQuery(sql, values) {
        if (sql.includes('WHERE telegram_id = $1')) return userRowQuery([{ id: 33, name: 'Sender' }]);
        if (sql.includes('WHERE id::text = $1')) {
          if (values[0] === '34') return userRowQuery([{ id: 34, telegramId: '700000034' }]);
          if (values[0] === '33') return userRowQuery([{ id: 33, telegramId: '700000033' }]);
          return userRowQuery([]);
        }
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.findGiftRecipient(700000033, '34'), {
      userId: 34, telegramId: '700000034', senderUserId: 33, senderName: 'Sender',
    });
    assert.deepEqual(await repository.findGiftRecipient(700000033, '33'), { invalid: true });
    assert.deepEqual(await repository.findGiftRecipient(700000033, 'rodas'), { invalid: true });
    assert.equal(await repository.findGiftRecipient(700000033, '999999999'), null);
  });

  it('findMatchIdBetween returns the shared match or null', async () => {
    const { calls, pool } = mockPool({
      onQuery: (sql, values) => (sql.includes('FROM matches')
        ? userRowQuery(values[0] === 33 && values[1] === 34 ? [{ id: '7' }] : [])
        : userRowQuery([])),
    });
    const repository = createAppRepository(pool);
    assert.equal(await repository.findMatchIdBetween(33, 34), '7');
    assert.equal(await repository.findMatchIdBetween(33, 35), null);
    assert.equal(calls.length, 2);
  });

  it('gift DM names the sender and gift with a way back', async () => {
    const inserted = [];
    const pool = {
      async query(sql, values) {
        if (sql.includes('INSERT INTO notifications_log')) inserted.push(values);
        return { rows: [] };
      },
    };
    const sent = [];
    const bot = { api: { async sendMessage(...args) { sent.push(args); return { message_id: 6 }; } } };
    const service = createNotificationHandler(pool, { webappUrl: 'https://libmatch.example' });
    const ok = await service.sendGiftNotification(bot, {
      userId: 34, telegramId: '700000034', senderName: 'Sender', gift,
    });
    assert.equal(ok, true);
    assert.equal(sent[0][0], '700000034');
    assert.match(sent[0][1], /Sender sent you a 🌹 Rose/);
    const url = sent[0][2].reply_markup.inline_keyboard[0][0].web_app.url;
    assert.equal(new URL(url).searchParams.get('tab'), 'likes');
    assert.equal(inserted[0][1], 'gift_received');
  });
});
