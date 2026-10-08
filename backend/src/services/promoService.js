import crypto from 'node:crypto';

export const CODE_PREFIX = 'DATEGRAM-';
export const CODE_RANDOM_LENGTH = 6;
/** Unambiguous alphabet: no 0/O, 1/I, so a code read aloud or retyped cannot be misread. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const DEFAULT_DISCOUNT_PERCENT = 50;
export const PROMO_TTL_DAYS = 7;
export const MAX_GENERATION_ATTEMPTS = 5;

export function generatePromoCode(randomBytes = crypto.randomBytes(CODE_RANDOM_LENGTH)) {
  const bytes = Buffer.isBuffer(randomBytes) ? randomBytes : Buffer.from(randomBytes);
  let code = '';
  for (let index = 0; index < CODE_RANDOM_LENGTH; index += 1) {
    code += CODE_ALPHABET[bytes[index % bytes.length] % CODE_ALPHABET.length];
  }
  return `${CODE_PREFIX}${code}`;
}

export function promoExpiry(now = new Date(), ttlDays = PROMO_TTL_DAYS) {
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}

export function isValidPromoCode(code) {
  if (typeof code !== 'string') return false;
  const body = code.toUpperCase().slice(CODE_PREFIX.length);
  return code.toUpperCase().startsWith(CODE_PREFIX)
    && body.length === CODE_RANDOM_LENGTH
    && [...body].every((character) => CODE_ALPHABET.includes(character));
}
