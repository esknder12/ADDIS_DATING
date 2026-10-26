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

describe('photo moderation (approval queue)', () => {
  it('addProfilePhoto inserts new uploads as pending', async () => {
    const { calls, pool } = mockPool({
      onQuery(sql) {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return userRowQuery([]);
        if (meByTelegram(sql)) return userRowQuery([{ id: MY_ID }]);
        if (sql.includes('COUNT(*)')) return userRowQuery([{ photo_count: 0 }]);
        if (sql.includes('INSERT INTO photos')) {
          return userRowQuery([{
            id: 5, url: 'https://x/y.jpg', cloudinary_public_id: null,
            order_index: 0, is_primary: true, moderation_status: 'pending', created_at: 'now',
          }]);
        }
        return userRowQuery([]);
      },
    });
    const repository = createAppRepository(pool);
    const outcome = await repository.addProfilePhoto(ME, { url: 'https://x/y.jpg', publicId: null });
    assert.equal(outcome.photo.moderationStatus, 'pending');
    const insert = calls.find((call) => call.sql.includes('INSERT INTO photos'));
    assert.ok(insert.sql.includes('moderation_status'));
    assert.ok(insert.sql.includes("'pending'"));
  });

  it('updatePhotoStatus approves and rejects by id text', async () => {
    const { calls, pool } = mockPool({
      onQuery: (sql, values) => (sql.includes('UPDATE photos')
        ? userRowQuery([{ id: values[0], status: values[1] }])
        : userRowQuery([])),
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.updatePhotoStatus('9', 'approved'), { id: '9', status: 'approved' });
    assert.deepEqual(await repository.updatePhotoStatus('9', 'rejected'), { id: '9', status: 'rejected' });
    assert.equal(calls.filter((call) => call.sql.includes('UPDATE photos')).length, 2);
  });

  it('updatePhotoStatus rejects bad input without writing', async () => {
    const { calls, pool } = mockPool({ onQuery: () => userRowQuery([]) });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.updatePhotoStatus('9', 'pending'), { invalid: true });
    assert.deepEqual(await repository.updatePhotoStatus('abc', 'approved'), { invalid: true });
    assert.equal(calls.length, 0);
  });

  it('listPhotosForReview defaults to pending, newest rules first', async () => {
    const { calls, pool } = mockPool({
      onQuery: (sql) => (sql.includes('FROM photos p')
        ? userRowQuery([{ id: '9', status: 'pending' }])
        : userRowQuery([])),
    });
    const repository = createAppRepository(pool);
    assert.deepEqual(await repository.listPhotosForReview({}), [{ id: '9', status: 'pending' }]);
    const select = calls.find((call) => call.sql.includes('FROM photos p'));
    assert.deepEqual(select.values, ['pending', 50]);
  });

  it('discovery SQL only shows approved photos to others', async () => {
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
    assert.ok(page.sql.includes("moderation_status = 'approved'"));
  });
});
