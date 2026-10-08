import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createUserRepository, mapUser } from '../src/db/userRepository.js';

describe('userRepository', () => {
  it('maps database names to the public API shape', () => {
    const user = mapUser({
      id: 42n,
      telegram_id: 123456789n,
      telegram_username: 'esknder',
      first_name: 'Esknder',
      last_name: 'Zinabie',
      photo_url: null,
      language_code: 'en',
      name: null,
      age: null,
      city: null,
      country: null,
      onboarding_completed: false,
      is_verified: false,
      is_vip: false,
      created_at: new Date('2026-10-08T10:00:00Z'),
    });

    assert.equal(user.id, '42');
    assert.equal(user.telegramId, '123456789');
    assert.equal(user.firstName, 'Esknder');
    assert.equal(user.onboardingCompleted, false);
  });

  it('exposes a predictable unavailable repository without a pool', async () => {
    const repository = createUserRepository(null);
    assert.equal(repository.isAvailable, false);
    await assert.rejects(repository.findByTelegramId('123'), /Database is not configured/);
  });
});
