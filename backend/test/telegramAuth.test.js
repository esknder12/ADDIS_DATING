import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import {
  TelegramAuthError,
  validateTelegramInitData,
} from '../src/middleware/telegramAuth.js';

const botToken = '123456789:phase-one-test-token';
const nowSeconds = 1_800_000_000;

function createSignedInitData(overrides = {}) {
  const values = {
    auth_date: String(nowSeconds - 10),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify({
      id: 987654321,
      first_name: 'Esknder',
      username: 'esknder',
      language_code: 'en',
    }),
    ...overrides,
  };

  const dataCheckString = Object.entries(values)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  return new URLSearchParams({ ...values, hash }).toString();
}

describe('validateTelegramInitData', () => {
  it('accepts a correctly signed, fresh payload', () => {
    const result = validateTelegramInitData(createSignedInitData(), botToken, {
      nowSeconds,
      maxAgeSeconds: 86_400,
    });

    assert.equal(result.user.id, 987654321);
    assert.equal(result.user.first_name, 'Esknder');
    assert.equal(result.queryId, 'AAHdF6IQAAAAAN0XohDhrOrc');
  });

  it('rejects a payload changed after signing', () => {
    const signed = createSignedInitData();
    const tampered = signed.replace('Esknder', 'SomeoneElse');

    assert.throws(
      () => validateTelegramInitData(tampered, botToken, { nowSeconds }),
      (error) => error instanceof TelegramAuthError && error.code === 'INVALID_SIGNATURE',
    );
  });

  it('rejects expired auth data', () => {
    const expired = createSignedInitData({ auth_date: String(nowSeconds - 90_000) });

    assert.throws(
      () => validateTelegramInitData(expired, botToken, {
        nowSeconds,
        maxAgeSeconds: 86_400,
      }),
      (error) => error instanceof TelegramAuthError && error.code === 'EXPIRED_INIT_DATA',
    );
  });

  it('rejects missing bot configuration without leaking implementation details', () => {
    assert.throws(
      () => validateTelegramInitData(createSignedInitData(), '', { nowSeconds }),
      (error) => error instanceof TelegramAuthError && error.code === 'AUTH_NOT_CONFIGURED',
    );
  });
});
