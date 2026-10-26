import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAppRepository } from '../src/db/appRepository.js';

const ME = 700000001;
const MY_ID = 11;

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

describe('account repository (deleteAccount)', () => {
  it('deletes dangling refs + user row in one transaction and returns photo ids', async () => {
    const { calls, pool } = mockPool({
      onQuery(sql) {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return userRowQuery([]);
        if (meByTelegram(sql)) return userRowQuery([{ id: MY_ID }]);
        if (sql.includes('FROM photos') && sql.includes('cloudinary_public_id')) {
          return userRowQuery([{ public_id: 'dategram/profile-photos/a' }, { public_id: null }]);
        }
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    const outcome = await repository.deleteAccount(ME);
    assert.deepEqual(outcome, {
      deleted: true,
      cloudinaryPublicIds: ['dategram/profile-photos/a'],
    });
    const statements = calls.map((call) => call.sql);
    assert.ok(statements.includes('BEGIN'));
    assert.ok(statements.includes('COMMIT'));
    const danglingMatches = calls.find((call) => call.sql.startsWith('DELETE FROM matches WHERE profile_id'));
    assert.ok(danglingMatches);
    assert.deepEqual(danglingMatches.values, [String(MY_ID)]);
    const danglingSwipes = calls.find((call) => call.sql.startsWith('DELETE FROM swipes WHERE profile_id'));
    assert.ok(danglingSwipes);
    assert.deepEqual(danglingSwipes.values, [String(MY_ID)]);
    const userDelete = calls.find((call) => call.sql === 'DELETE FROM users WHERE id = $1');
    assert.ok(userDelete);
    assert.deepEqual(userDelete.values, [MY_ID]);
    // The user row goes last so FK cascades fire exactly once.
    assert.ok(statements.indexOf('DELETE FROM users WHERE id = $1') > statements.indexOf(danglingMatches.sql));
  });

  it('returns null and rolls back when the profile is missing', async () => {
    const { calls, pool } = mockPool({ onQuery: () => userRowQuery([]) });
    const repository = createAppRepository(pool);
    assert.equal(await repository.deleteAccount(ME), null);
    assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
    assert.ok(!calls.some((call) => call.sql.startsWith('DELETE FROM users')));
  });

  it('rolls back when a delete fails', async () => {
    const { calls, pool } = mockPool({
      onQuery(sql) {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return userRowQuery([]);
        if (meByTelegram(sql)) return userRowQuery([{ id: MY_ID }]);
        if (sql.startsWith('DELETE FROM users')) throw new Error('boom');
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    await assert.rejects(() => repository.deleteAccount(ME), /boom/);
    assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
  });
});
