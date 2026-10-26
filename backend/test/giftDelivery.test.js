import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseGiftPayload } from '../src/bot/bot.js';
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

describe('gift delivery (real Stars gifts)', () => {
  it('findGiftRecipient resolves real recipients, never self or ghosts', async () => {
    const { pool } = mockPool({
      onQuery(sql, values) {
        if (sql.includes('WHERE telegram_id = $1')) return userRowQuery([{ id: 33, name: 'Sender' }]);
        if (sql.includes('WHERE id::text = $1')) {
          if (values[0] === '34') return userRowQuery([{ id: 34, telegramId: '700000034', name: 'Rodas' }]);
          if (values[0] === '33') return userRowQuery([{ id: 33, telegramId: '700000033', name: 'Sender' }]);
          return userRowQuery([]);
        }
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.findGiftRecipient(700000033, '34'), {
      userId: 34, telegramId: '700000034', recipientName: 'Rodas',
      senderUserId: 33, senderName: 'Sender',
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

  it('createPendingGift stages a pending order, idempotent by client ref', async () => {
    const { calls, pool } = mockPool({
      onQuery(sql, values) {
        if (sql.includes('INSERT INTO gift_transactions')) {
          if (values[4] === 'repeat-ref') return userRowQuery([]);
          return userRowQuery([{ id: '9', giftId: 'rose', stars: 31, status: 'pending', clientRef: values[4] }]);
        }
        if (sql.includes('FROM gift_transactions g JOIN users u')) {
          return userRowQuery([{ id: '9', giftId: 'rose', stars: 31, status: 'pending', clientRef: 'repeat-ref' }]);
        }
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    const first = await repository.createPendingGift(700000033, '34', gift, 'ref-1');
    assert.equal(first.status, 'pending');
    const insert = calls.find((call) => call.sql.includes('INSERT INTO gift_transactions'));
    assert.ok(insert.sql.includes("'pending'"));
    const repeat = await repository.createPendingGift(700000033, '34', gift, 'repeat-ref');
    assert.equal(repeat.id, '9');
  });

  it('confirmGiftPayment settles pending orders exactly once', async () => {
    const updates = [];
    const { pool } = mockPool({
      onQuery(sql, values) {
        if (sql.includes('FROM gift_transactions g')) {
          if (values[0] === 'paid-ref') {
            return userRowQuery([{ id: '9', giftId: 'rose', stars: 31, status: 'paid', delivered: true }]);
          }
          if (values[0] === 'ghost-ref') return userRowQuery([]);
          if (values[0] === 'owned-ref') {
            return userRowQuery([{ id: '10', giftId: 'rose', stars: 31, status: 'pending', senderTelegramId: 700000034 }]);
          }
          return userRowQuery([{
            id: '9', giftId: 'rose', stars: 31, status: 'pending', delivered: false,
            userId: 33, profileId: '34', senderTelegramId: 700000033,
            senderName: 'Sender', recipientTelegramId: '700000034',
          }]);
        }
        if (sql.includes('UPDATE gift_transactions SET status')) {
          updates.push(values);
          return userRowQuery([]);
        }
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    const paid = await repository.confirmGiftPayment('ref-1', 'paid');
    assert.equal(paid.status, 'paid');
    assert.equal(paid.alreadyPaid, false);
    assert.deepEqual(updates[0], ['ref-1', 'paid']);
    const failed = await repository.confirmGiftPayment('ref-2', 'cancelled');
    assert.equal(failed.status, 'failed');
    const dup = await repository.confirmGiftPayment('paid-ref', 'paid');
    assert.equal(dup.alreadyPaid, true);
    assert.equal(updates.length, 2);
    assert.equal(await repository.confirmGiftPayment('ghost-ref', 'paid'), null);
    assert.deepEqual(await repository.confirmGiftPayment('owned-ref', 'paid', 700000033), { forbidden: true });
    assert.equal(updates.length, 2);
  });

  it('findPendingGiftByRef feeds the pre-checkout gate', async () => {
    const { calls, pool } = mockPool({
      onQuery: (sql) => (sql.includes('FROM gift_transactions WHERE client_ref')
        ? userRowQuery([{ id: '9', giftId: 'rose', stars: 31, status: 'pending' }])
        : userRowQuery([])),
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.findPendingGiftByRef('ref-1'), {
      id: '9', giftId: 'rose', stars: 31, status: 'pending',
    });
    assert.deepEqual(calls[0].values, ['ref-1']);
  });

  it('gift payload parser only accepts well-formed order refs', () => {
    assert.deepEqual(parseGiftPayload('gift:abc:34:rose:123'), { clientRef: 'abc:34:rose:123' });
    assert.equal(parseGiftPayload('verify:approve:7'), null);
    assert.equal(parseGiftPayload('gift:'), null);
    assert.equal(parseGiftPayload(null), null);
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
