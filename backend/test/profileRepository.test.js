import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAppRepository } from '../src/db/appRepository.js';

function photoPool(initialPhotos = []) {
  const state = { photos: initialPhotos.map((photo) => ({ ...photo })), nextId: 1 };
  for (const photo of state.photos) state.nextId = Math.max(state.nextId, Number(photo.id) + 1);
  const client = {
    async query(rawSql, values = []) {
      const sql = rawSql.replace(/\s+/g, ' ').trim();
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
      if (sql.startsWith('SELECT id FROM users WHERE telegram_id')) return { rows: [{ id: '20' }] };
      if (sql.startsWith('SELECT COUNT(*)::int AS photo_count')) {
        return { rows: [{ photo_count: state.photos.length }] };
      }
      if (sql.startsWith('INSERT INTO photos')) {
        const [userId, url, publicId, orderIndex, isPrimary] = values;
        const photo = {
          id: String(state.nextId++),
          user_id: String(userId),
          url,
          cloudinary_public_id: publicId,
          order_index: orderIndex,
          is_primary: isPrimary,
          created_at: new Date(`2026-10-09T12:00:0${orderIndex}.000Z`),
        };
        state.photos.push(photo);
        return { rows: [{ ...photo }] };
      }
      if (sql.startsWith('SELECT id, cloudinary_public_id, is_primary FROM photos')) {
        const photo = state.photos.find((entry) => entry.id === String(values[0]) && entry.user_id === String(values[1]));
        return { rows: photo ? [{ ...photo }] : [] };
      }
      if (sql.startsWith('DELETE FROM photos')) {
        state.photos = state.photos.filter((photo) => !(photo.id === String(values[0]) && photo.user_id === String(values[1])));
        return { rows: [] };
      }
      if (sql.startsWith('SELECT id FROM photos WHERE user_id = $1 ORDER BY') && sql.includes('LIMIT 1')) {
        const next = [...state.photos].filter((photo) => photo.user_id === String(values[0]))
          .sort((left, right) => left.order_index - right.order_index || left.id.localeCompare(right.id))[0];
        return { rows: next ? [{ id: next.id }] : [] };
      }
      if (sql.startsWith('UPDATE photos SET is_primary = TRUE')) {
        const photo = state.photos.find((entry) => entry.id === String(values[0]));
        if (photo) photo.is_primary = true;
        return { rows: [] };
      }
      if (sql.startsWith('WITH ranked AS')) {
        [...state.photos].filter((photo) => photo.user_id === String(values[0]))
          .sort((left, right) => left.order_index - right.order_index || left.id.localeCompare(right.id))
          .forEach((photo, index) => { photo.order_index = index; });
        return { rows: [] };
      }
      if (sql.startsWith('SELECT id FROM photos WHERE user_id = $1 ORDER BY order_index ASC FOR UPDATE')) {
        return { rows: [...state.photos].filter((photo) => photo.user_id === String(values[0]))
          .sort((left, right) => left.order_index - right.order_index)
          .map((photo) => ({ id: photo.id })) };
      }
      if (sql.startsWith('UPDATE photos SET is_primary = FALSE')) {
        for (const photo of state.photos) {
          if (photo.user_id === String(values[0])) photo.is_primary = false;
        }
        return { rows: [] };
      }
      if (sql.startsWith('UPDATE photos SET order_index = $1, is_primary = $2')) {
        const [orderIndex, isPrimary, photoId, userId] = values;
        const photo = state.photos.find((entry) => entry.id === String(photoId) && entry.user_id === String(userId));
        if (photo) Object.assign(photo, { order_index: orderIndex, is_primary: isPrimary });
        return { rows: [] };
      }
      throw new Error(`Unexpected photo repository SQL: ${sql}`);
    },
    release() {},
  };
  return { state, pool: { async connect() { return client; } } };
}

describe('profile photo repository', () => {
  it('limits profiles to six photos and marks only the first upload primary', async () => {
    const memory = photoPool();
    const repository = createAppRepository(memory.pool);
    const first = await repository.addProfilePhoto('135792468', { url: 'https://cdn/one.jpg', publicId: 'one' });
    const second = await repository.addProfilePhoto('135792468', { url: 'https://cdn/two.jpg', publicId: 'two' });
    assert.equal(first.photo.isPrimary, true);
    assert.equal(first.photo.orderIndex, 0);
    assert.equal(second.photo.isPrimary, false);
    assert.equal(second.photo.orderIndex, 1);

    memory.state.photos.push(...Array.from({ length: 4 }, (_, index) => ({
      id: String(index + 3), user_id: '20', url: `https://cdn/${index + 3}.jpg`,
      order_index: index + 2, is_primary: false,
    })));
    const rejected = await repository.addProfilePhoto('135792468', { url: 'https://cdn/seven.jpg', publicId: 'seven' });
    assert.equal(rejected.error, 'PHOTO_LIMIT');
    assert.equal(memory.state.photos.length, 6);
  });

  it('promotes the next photo after primary deletion and compacts ordering', async () => {
    const memory = photoPool([
      { id: '1', user_id: '20', url: 'one', cloudinary_public_id: 'one', order_index: 0, is_primary: true },
      { id: '2', user_id: '20', url: 'two', cloudinary_public_id: 'two', order_index: 1, is_primary: false },
      { id: '3', user_id: '20', url: 'three', cloudinary_public_id: 'three', order_index: 2, is_primary: false },
    ]);
    const repository = createAppRepository(memory.pool);
    const result = await repository.deleteProfilePhoto('135792468', '1');
    assert.deepEqual(result, { deleted: true, publicId: 'one' });
    assert.equal(memory.state.photos.find((photo) => photo.id === '2').is_primary, true);
    assert.equal(memory.state.photos.find((photo) => photo.id === '2').order_index, 0);
    assert.equal(memory.state.photos.find((photo) => photo.id === '3').order_index, 1);
  });

  it('requires the complete unique photo list when reordering', async () => {
    const memory = photoPool([
      { id: '1', user_id: '20', url: 'one', order_index: 0, is_primary: true },
      { id: '2', user_id: '20', url: 'two', order_index: 1, is_primary: false },
    ]);
    const repository = createAppRepository(memory.pool);
    const invalid = await repository.reorderProfilePhotos('135792468', ['1']);
    assert.equal(invalid.error, 'INVALID_PHOTO_ORDER');
    const reordered = await repository.reorderProfilePhotos('135792468', ['2', '1']);
    assert.deepEqual(reordered.photos, [
      { id: '2', orderIndex: 0, isPrimary: true },
      { id: '1', orderIndex: 1, isPrimary: false },
    ]);
    assert.equal(memory.state.photos.find((photo) => photo.id === '2').is_primary, true);
  });
});
