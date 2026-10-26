import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseVerificationCallback } from '../src/bot/bot.js';
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

describe('verification review', () => {
  it('getVerificationRequest returns the request with its owner', async () => {
    const { calls, pool } = mockPool({
      onQuery: (sql) => (sql.includes('FROM verification_requests r JOIN users u')
        ? userRowQuery([{
          id: '7', status: 'pending', telegramFileId: 'file-1',
          userId: '11', userName: 'Abebe', telegramId: '700000002',
          profilePhotoUrl: 'https://cdn.example.test/abebe.jpg',
        }])
        : userRowQuery([])),
    });
    const repository = createAppRepository(pool);
    const request = await repository.getVerificationRequest('7');
    assert.equal(request.telegramFileId, 'file-1');
    assert.equal(request.profilePhotoUrl, 'https://cdn.example.test/abebe.jpg');
    assert.equal(request.telegramId, '700000002');
    assert.deepEqual(calls[0].values, ['7']);
    assert.equal(await repository.getVerificationRequest('nope'), null);
  });

  it('listVerificationRequests defaults to pending, oldest first', async () => {
    const { calls, pool } = mockPool({
      onQuery: (sql) => (sql.includes('FROM verification_requests r')
        ? userRowQuery([{ id: '7', status: 'pending' }])
        : userRowQuery([])),
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.listVerificationRequests({}), [{ id: '7', status: 'pending' }]);
    const select = calls.find((call) => call.sql.includes('FROM verification_requests r'));
    assert.deepEqual(select.values, ['pending', 50]);
  });

  it('approving grants the badge, rejecting resets to unverified', async () => {
    const updates = [];
    const { pool } = mockPool({
      onQuery(sql, values) {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return userRowQuery([]);
        if (sql.includes('UPDATE verification_requests')) {
          return userRowQuery([{ id: '7', status: values[1], user_id: 11 }]);
        }
        if (sql.includes('UPDATE users SET verification_status')) {
          updates.push(values);
          return userRowQuery([]);
        }
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.updateVerificationStatus('7', 'approved'), { id: '7', status: 'verified' });
    assert.deepEqual(await repository.updateVerificationStatus('7', 'rejected'), { id: '7', status: 'rejected' });
    assert.deepEqual(updates, [[11, 'verified'], [11, 'none']]);
  });

  it('updateVerificationStatus rejects bad input without writing', async () => {
    const { calls, pool } = mockPool({ onQuery: () => userRowQuery([]) });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.updateVerificationStatus('7', 'pending'), { invalid: true });
    assert.deepEqual(await repository.updateVerificationStatus('abc', 'approved'), { invalid: true });
    assert.equal(calls.length, 0);
  });

  it('review callback parser only accepts well-formed owner taps', () => {
    assert.deepEqual(parseVerificationCallback('verify:approve:7'), { requestId: '7', decision: 'verified' });
    assert.deepEqual(parseVerificationCallback('verify:reject:7'), { requestId: '7', decision: 'rejected' });
    assert.equal(parseVerificationCallback('verify:approve:0'), null);
    assert.equal(parseVerificationCallback('photo:approve:7'), null);
    assert.equal(parseVerificationCallback(null), null);
  });

  it('instructions DM carries the nudge plus the how-to', async () => {
    const pool = { async query() { return { rows: [] }; } };
    const sent = [];
    const bot = { api: { async sendMessage(...args) { sent.push(args); return { message_id: 1 }; } } };
    const service = createNotificationHandler(pool, { webappUrl: 'https://libmatch.example' });
    assert.equal(await service.sendVerificationInstructions(bot, 700000002), true);
    assert.equal(sent.length, 2);
    assert.match(sent[0][1], /almost there/);
    assert.match(sent[1][1], /checkmark/);
  });

  it('review request forwards the video note with verify buttons', async () => {
    const inserted = [];
    const pool = {
      async query(sql, values) {
        if (sql.includes('INSERT INTO notifications_log')) inserted.push(values);
        return { rows: [] };
      },
    };
    const notes = [];
    const photos = [];
    const sent = [];
    const bot = { api: {
      async sendVideoNote(...args) { notes.push(args); return { message_id: 2 }; },
      async sendPhoto(...args) { photos.push(args); return { message_id: 5 }; },
      async sendMessage(...args) { sent.push(args); return { message_id: 3 }; },
    } };
    const service = createNotificationHandler(pool, { webappUrl: 'https://libmatch.example' });
    const ok = await service.sendVerificationReviewRequest(bot, '999', {
      id: '7', userId: '11', userName: 'Abebe', telegramFileId: 'file-1',
      profilePhotoUrl: 'https://cdn.example.test/abebe.jpg',
    });
    assert.equal(ok, true);
    assert.deepEqual(notes[0], ['999', 'file-1']);
    assert.deepEqual(photos[0].slice(0, 2), ['999', 'https://cdn.example.test/abebe.jpg']);
    assert.match(photos[0][2].caption, /compare faces/);
    const buttons = sent[0][2].reply_markup.inline_keyboard[0];
    assert.equal(buttons[0].callback_data, 'verify:approve:7');
    assert.equal(buttons[1].callback_data, 'verify:reject:7');
    assert.equal(inserted[0][1], 'verification_review');
  });

  it('decision DM tells the user the outcome', async () => {
    const inserted = [];
    const pool = {
      async query(sql, values) {
        if (sql.includes('INSERT INTO notifications_log')) inserted.push(values);
        return { rows: [] };
      },
    };
    const sent = [];
    const bot = { api: { async sendMessage(...args) { sent.push(args); return { message_id: 4 }; } } };
    const service = createNotificationHandler(pool, { webappUrl: 'https://libmatch.example' });
    assert.equal(await service.sendVerificationDecisionNotification(bot, 11, '700000002', true), true);
    assert.equal(await service.sendVerificationDecisionNotification(bot, 11, '700000002', false), true);
    assert.match(sent[0][1], /verified/);
    assert.match(sent[1][1], /did not pass/);
    assert.deepEqual(inserted.map((row) => row[1]), ['verification_approved', 'verification_rejected']);
  });
});
