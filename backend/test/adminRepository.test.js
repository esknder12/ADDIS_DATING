import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAppRepository } from '../src/db/appRepository.js';

function userRowQuery(rows) {
  return { rows };
}

function mockPool({ onQuery } = {}) {
  const calls = [];
  return {
    calls,
    pool: {
      async query(sql, values) {
        calls.push({ sql, values });
        return onQuery(sql, values, calls);
      },
      async connect() {
        throw new Error('should not use transactions');
      },
    },
  };
}

describe('admin repository (moderation)', () => {
  it('updateSafetyReportStatus transitions open -> reviewed', async () => {
    const { calls, pool } = mockPool({
      onQuery: (sql) => (sql.includes('UPDATE reports')
        ? userRowQuery([{ id: '7', status: 'reviewed' }])
        : userRowQuery([])),
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.updateSafetyReportStatus('7', 'reviewed'), {
      id: '7',
      status: 'reviewed',
    });
    const update = calls.find((call) => call.sql.includes('UPDATE reports'));
    assert.deepEqual(update.values, ['7', 'reviewed']);
  });

  it('updateSafetyReportStatus rejects bad input without writing', async () => {
    const { calls, pool } = mockPool({ onQuery: () => userRowQuery([]) });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.updateSafetyReportStatus('7', 'nope'), { invalid: true });
    assert.deepEqual(await repository.updateSafetyReportStatus('abc', 'open'), { invalid: true });
    assert.equal(calls.length, 0);
  });

  it('updateSafetyReportStatus returns null for unknown reports', async () => {
    const { pool } = mockPool({ onQuery: () => userRowQuery([]) });
    const repository = createAppRepository(pool);
    assert.equal(await repository.updateSafetyReportStatus('999', 'open'), null);
  });

  it('setUserActiveStatus bans and unbans by id text', async () => {
    const { calls, pool } = mockPool({
      onQuery: (sql, values) => (sql.includes('UPDATE users')
        ? userRowQuery([{ id: values[0], isActive: values[1] }])
        : userRowQuery([])),
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.setUserActiveStatus('22', false), { id: '22', isActive: false });
    assert.deepEqual(await repository.setUserActiveStatus('22', true), { id: '22', isActive: true });
    assert.equal(calls.filter((call) => call.sql.includes('UPDATE users')).length, 2);
  });

  it('setUserActiveStatus rejects bad ids without writing', async () => {
    const { calls, pool } = mockPool({ onQuery: () => userRowQuery([]) });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.setUserActiveStatus('0', false), { invalid: true });
    assert.equal(calls.length, 0);
  });
});
