import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAppRepository } from '../src/db/appRepository.js';

const ME = 700000001;
const MY_ID = 11;
const THEIR_ID = 22;

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

const meByTelegram = (sql) => sql.includes('FROM users WHERE telegram_id');
const userByIdText = (sql) => sql.includes('id::text = $1');

describe('safety repository (block/report)', () => {
  it('blockUser inserts a block row for a valid target', async () => {
    const { calls, pool } = mockPool({
      onQuery(sql) {
        if (meByTelegram(sql)) return userRowQuery([{ id: MY_ID }]);
        if (userByIdText(sql)) return userRowQuery([{ id: THEIR_ID }]);
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    const outcome = await repository.blockUser(ME, String(THEIR_ID));
    assert.deepEqual(outcome, { blocked: true });
    const insert = calls.find((call) => call.sql.includes('INSERT INTO blocks'));
    assert.ok(insert);
    assert.deepEqual(insert.values, [MY_ID, THEIR_ID]);
  });

  it('blockUser rejects blocking yourself without writing', async () => {
    const { calls, pool } = mockPool({
      onQuery(sql) {
        if (meByTelegram(sql)) return userRowQuery([{ id: MY_ID }]);
        if (userByIdText(sql)) return userRowQuery([{ id: MY_ID }]);
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.blockUser(ME, String(MY_ID)), { invalid: true });
    assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO blocks')).length, 0);
  });

  it('unblockUser deletes the block row (idempotent)', async () => {
    const { calls, pool } = mockPool({
      onQuery(sql) {
        if (meByTelegram(sql)) return userRowQuery([{ id: MY_ID }]);
        if (userByIdText(sql)) return userRowQuery([{ id: THEIR_ID }]);
        if (sql.startsWith('DELETE FROM blocks')) return { rows: [], rowCount: 1 };
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.unblockUser(ME, String(THEIR_ID)), { unblocked: true });
    assert.ok(calls.some((call) => call.sql.startsWith('DELETE FROM blocks')));
  });

  it('listBlockedUsers maps blocked profiles', async () => {
    const { pool } = mockPool({
      onQuery(sql) {
        if (meByTelegram(sql)) return userRowQuery([{ id: MY_ID }]);
        return userRowQuery([{ id: '22', name: null, first_name: 'Sam', photo: '/p.jpg', blocked_at: 'now' }]);
      },
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.listBlockedUsers(ME), [
      { id: '22', name: 'Sam', photo: '/p.jpg', blockedAt: 'now' },
    ]);
  });

  it('reportUser rejects unknown reasons before touching the database', async () => {
    const { calls, pool } = mockPool({ onQuery: () => userRowQuery([]) });
    const repository = createAppRepository(pool);
    assert.deepEqual(
      await repository.reportUser(ME, String(THEIR_ID), { reason: 'nope', details: '', block: true }),
      { invalid: true },
    );
    assert.equal(calls.length, 0);
  });

  it('reportUser stores the report and the block in one transaction', async () => {
    const { calls, pool } = mockPool({
      onQuery(sql) {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return userRowQuery([]);
        if (meByTelegram(sql)) return userRowQuery([{ id: MY_ID }]);
        if (userByIdText(sql)) return userRowQuery([{ id: THEIR_ID }]);
        if (sql.includes('INSERT INTO reports')) return userRowQuery([{ id: 55 }]);
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    const outcome = await repository.reportUser(ME, String(THEIR_ID), {
      reason: 'spam', details: 'test', block: true,
    });
    assert.deepEqual(outcome, { report: { id: '55' }, blocked: true });
    assert.ok(calls.some((call) => call.sql.includes('INSERT INTO reports')));
    assert.ok(calls.some((call) => call.sql.includes('INSERT INTO blocks')));
    assert.ok(calls.some((call) => call.sql === 'COMMIT'));
  });

  it('discovery SQL excludes blocked users in both directions', async () => {
    const { calls, pool } = mockPool({
      onQuery(sql) {
        if (sql.includes('preferred_city')) {
          return userRowQuery([{
            id: MY_ID, gender: 'male', preferred_city: null, preferred_country: null,
            age_range_preference: null, interested_in_gender: 'female',
          }]);
        }
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    await repository.listDiscover(ME, { limit: 5, offset: 0 });
    const page = calls.find((call) => call.sql.includes('LIMIT $7'));
    assert.ok(page.sql.includes('FROM blocks'));
    assert.ok(page.sql.includes('blocker_user_id = $1'));
  });

  it('saveSwipe short-circuits with { blocked: true } for blocked pairs', async () => {
    const { pool } = mockPool({
      onQuery(sql) {
        if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT') return userRowQuery([]);
        if (sql.includes('preferred_city')) {
          return userRowQuery([{
            id: MY_ID, gender: 'male', preferred_city: null, preferred_country: null,
            age_range_preference: null, interested_in_gender: 'female',
          }]);
        }
        if (sql.includes('FROM users') && sql.includes('id <>')) return userRowQuery([{ id: THEIR_ID }]);
        if (sql.includes('FROM blocks')) return userRowQuery([{ '?column?': 1 }]);
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.saveSwipe(ME, String(THEIR_ID), 'like'), { blocked: true });
  });
});
