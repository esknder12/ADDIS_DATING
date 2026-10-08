import {
  answersHash,
  calculateProfileScore,
  estimateMatchPool,
  getDatingStyle,
  getFourWeekGoalLabel,
  getResponseRateMultiplier,
  getScoreTier,
  getYourType,
} from '@dategram/shared/scoring';
import {
  calculateScore,
  completeResults,
  fetchResults,
  generatePromo,
  saveEmail,
  saveName,
} from '../api/results.api.js';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAIL_LENGTH = 320;
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 80;

export function validateEmailInput(raw) {
  if (raw === undefined || raw === null) return { valid: true, value: null };
  if (typeof raw !== 'string') return { valid: false };

  const value = raw.trim();
  if (value.length === 0) return { valid: true, value: null };
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(value)) return { valid: false };
  return { valid: true, value: value.toLowerCase() };
}

export function validateNameInput(raw) {
  if (typeof raw !== 'string') return { valid: false };

  // eslint-disable-next-line no-control-regex
  const value = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (value.length < MIN_NAME_LENGTH || value.length > MAX_NAME_LENGTH) return { valid: false };
  return { valid: true, value };
}

/** Telegram users: every action is a server round-trip, identity comes from signed initData. */
export function createResultsApiStore() {
  return {
    async load() {
      try {
        const data = await fetchResults();
        return { results: data.results, user: null };
      } catch (error) {
        // A 409 simply means the score has not been calculated yet, which is the normal
        // first-run state rather than an error.
        if (error.response?.status === 409) return { results: null, user: null };
        throw error;
      }
    },
    async calculate() {
      const data = await calculateScore();
      return { results: data.results, user: null };
    },
    async setEmail(email) {
      const data = await saveEmail(email);
      return { results: data.results, user: null };
    },
    async setName(name) {
      const data = await saveName(name);
      return { results: data.results, user: null };
    },
    async getPromo() {
      const data = await generatePromo();
      return data.promo;
    },
    async complete() {
      const data = await completeResults();
      return data.user;
    },
  };
}

const PROMO_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SCORING_SECRET = 'dategram-preview';

function randomPromoCode() {
  const bytes = new Uint8Array(6);
  window.crypto.getRandomValues(bytes);
  return `DATEGRAM-${[...bytes].map((byte) => PROMO_ALPHABET[byte % PROMO_ALPHABET.length]).join('')}`;
}

function toPayload(record, answers) {
  return {
    score: record.profileScore,
    scoreTier: record.scoreTier,
    yourType: getYourType(answers),
    datingStyle: record.datingStyle,
    matchPoolCount: record.matchPoolCount,
    matchPoolCity: record.city || null,
    responseRateMultiplier: record.responseRateMultiplier,
    fourWeekGoalLabel: getFourWeekGoalLabel(answers),
    email: record.email,
    name: record.name,
    photoUrl: record.photoUrl || null,
    resultsViewedAt: record.resultsViewedAt,
    resultsCompleted: Boolean(record.resultsCompleted),
    promo: record.promo || null,
  };
}

/**
 * Browser preview: same interface, same scoring maths (imported from `@dategram/shared`),
 * persisted under a versioned LocalStorage key. Nothing is sent to a protected endpoint.
 */
export function createResultsLocalStore({ user, readAnswers }) {
  const storageKey = `dategram:results:v1:${user.telegramId}`;

  function readRecord() {
    try {
      const cached = window.localStorage.getItem(storageKey);
      return cached ? JSON.parse(cached) : {};
    } catch {
      window.localStorage.removeItem(storageKey);
      return {};
    }
  }

  function writeRecord(patch) {
    const next = {
      city: 'Addis Ababa',
      photoUrl: user.photoUrl || null,
      email: null,
      name: null,
      profileScore: null,
      scoreTier: null,
      datingStyle: null,
      matchPoolCount: null,
      responseRateMultiplier: null,
      answersHash: null,
      promo: null,
      resultsViewedAt: null,
      resultsCompleted: false,
      ...readRecord(),
      ...patch,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  }

  return {
    async load() {
      const record = readRecord();
      if (record.profileScore === null || record.profileScore === undefined) {
        return { results: null, user: null };
      }
      return { results: toPayload(record, readAnswers()), user: null };
    },

    async calculate() {
      const answers = readAnswers();
      const record = readRecord();
      const hash = answersHash(answers);

      if (record.profileScore !== null && record.answersHash === hash) {
        return { results: toPayload(record, answers), user: null };
      }

      const { score } = calculateProfileScore(answers, { userId: user.telegramId, secret: SCORING_SECRET });
      const datingStyle = getDatingStyle(answers);
      const saved = writeRecord({
        profileScore: score,
        scoreTier: getScoreTier(score),
        answersHash: hash,
        matchPoolCount: estimateMatchPool({ userId: user.telegramId, city: record.city || '', secret: SCORING_SECRET }),
        datingStyle,
        responseRateMultiplier: getResponseRateMultiplier(datingStyle),
      });
      return { results: toPayload(saved, answers), user: null };
    },

    async setEmail(email) {
      const validation = validateEmailInput(email);
      if (!validation.valid) {
        const error = new Error('Enter a valid email address, or skip this step.');
        error.code = 'INVALID_EMAIL';
        throw error;
      }
      const saved = writeRecord({ email: validation.value });
      return { results: toPayload(saved, readAnswers()), user: null };
    },

    async setName(name) {
      const validation = validateNameInput(name);
      if (!validation.valid) {
        const error = new Error(`Enter your name using ${MIN_NAME_LENGTH} to ${MAX_NAME_LENGTH} characters.`);
        error.code = 'INVALID_NAME';
        throw error;
      }
      const saved = writeRecord({ name: validation.value });
      return { results: toPayload(saved, readAnswers()), user: null };
    },

    async getPromo() {
      const record = readRecord();
      if (record.promo) return record.promo;

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const promo = { code: randomPromoCode(), discountPercent: 50, expiresAt: expiresAt.toISOString() };
      writeRecord({ promo });
      return promo;
    },

    async complete() {
      const record = readRecord();
      if (!record.name) {
        const error = new Error('Add your name before entering Dategram.');
        error.code = 'NAME_REQUIRED';
        throw error;
      }
      writeRecord({
        resultsCompleted: true,
        resultsViewedAt: record.resultsViewedAt || new Date().toISOString(),
      });
      return { ...user, resultsCompleted: true, name: record.name, email: record.email };
    },
  };
}
