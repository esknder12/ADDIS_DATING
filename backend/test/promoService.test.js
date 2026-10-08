import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import {
  CODE_ALPHABET,
  CODE_PREFIX,
  DEFAULT_DISCOUNT_PERCENT,
  PROMO_TTL_DAYS,
  generatePromoCode,
  isValidPromoCode,
  promoExpiry,
} from '../src/services/promoService.js';

describe('promo service', () => {
  it('generates a prefixed code built only from the unambiguous alphabet', () => {
    for (let index = 0; index < 500; index += 1) {
      const code = generatePromoCode();
      assert.ok(code.startsWith(CODE_PREFIX), code);
      const body = code.slice(CODE_PREFIX.length);
      assert.equal(body.length, 6);
      for (const character of body) {
        assert.ok(CODE_ALPHABET.includes(character), `${character} not in alphabet`);
      }
      assert.ok(!/[0O1I]/.test(body), 'must not contain ambiguous characters');
      assert.equal(isValidPromoCode(code), true);
    }
  });

  it('derives the code deterministically from the supplied bytes', () => {
    const bytes = Buffer.from([0, 1, 2, 3, 4, 5]);
    assert.equal(generatePromoCode(bytes), generatePromoCode(Buffer.from([0, 1, 2, 3, 4, 5])));
    assert.equal(generatePromoCode(bytes), `${CODE_PREFIX}234567`);
  });

  it('maps distinct entropy to distinct codes across 10000 deterministic draws', () => {
    // Uniqueness of random draws is a birthday-paradox property of the 32^6 space, not a
    // guarantee, so it is asserted structurally instead: only the low 5 bits of each byte are
    // used, so a bijection over those bits must produce distinct codes.
    const seen = new Set();
    for (let index = 0; index < 10_000; index += 1) {
      const bytes = Buffer.from([
        index & 31,
        (index >> 5) & 31,
        (index >> 10) & 31,
        (index >> 15) & 31,
        (index >> 20) & 31,
        (index >> 25) & 31,
      ]);
      seen.add(generatePromoCode(bytes));
    }
    assert.equal(seen.size, 10_000);
  });

  it('uses the full alphabet across random draws', () => {
    const characters = new Set();
    for (let index = 0; index < 2_000; index += 1) {
      for (const character of generatePromoCode(crypto.randomBytes(6))) {
        if (character !== '-') characters.add(character);
      }
    }
    assert.equal(characters.size, CODE_ALPHABET.length, 'every alphabet character should appear');
  });

  it('rejects malformed codes', () => {
    assert.equal(isValidPromoCode('DATEGRAM-ABC'), false);
    assert.equal(isValidPromoCode('DATEGRAM-ABCDE0'), false);
    assert.equal(isValidPromoCode('OTHER-ABC123'), false);
    assert.equal(isValidPromoCode(null), false);
    assert.equal(isValidPromoCode('dategram-7qk2mx'), true, 'case-insensitive');
  });

  it('expires the discount after the configured number of days', () => {
    const now = new Date('2026-10-08T09:00:00.000Z');
    assert.equal(promoExpiry(now).toISOString(), '2026-10-15T09:00:00.000Z');
    assert.equal(promoExpiry(now, 1).toISOString(), '2026-10-09T09:00:00.000Z');
    assert.equal(PROMO_TTL_DAYS, 7);
    assert.equal(DEFAULT_DISCOUNT_PERCENT, 50);
  });
});
