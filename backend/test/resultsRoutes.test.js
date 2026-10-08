import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import {
  CODE_ALPHABET,
  CODE_PREFIX,
  generatePromoCode,
  isValidPromoCode,
  promoExpiry,
} from '../src/services/promoService.js';
import { createResultsService } from '../src/services/resultsService.js';
import { normaliseEmail, normaliseName } from '../src/db/resultsRepository.js';

const botToken = '987654321:phase-three-route-test-token';
const TELEGRAM_ID = 31415926;

function signedInitData(telegramId = TELEGRAM_ID) {
  const values = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'phase-three-query',
    user: JSON.stringify({ id: telegramId, first_name: 'Phase Three' }),
  };
  const check = Object.entries(values)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...values, hash }).toString();
}

const runtimeConfig = {
  isProduction: false,
  corsOrigins: [],
  botToken,
  telegramAuthMaxAgeSeconds: 86_400,
};

const ANSWERS = {
  gender: 'male',
  what_matters: ['emotional_connection', 'supports_goals'],
  dealbreakers: ['smoking'],
  date_readiness: 'ready_right_match',
  looking_for: ['serious_relationship'],
  common_interests: ['travel_discovery', 'movies_music'],
  first_move_preference: 'i_do',
  conversation_confidence: 'confident',
  style_preference: ['natural'],
  age_range_preference: '25_30',
  four_week_goal: 'one_first_date',
  location: { id: 'addis-ababa-et', name: 'Addis Ababa', country: 'Ethiopia', region: 'Addis Ababa' },
};

/**
 * In-memory stand-in for the Postgres-backed repository. It reproduces the invariants the SQL
 * enforces (unique promo code, name required to complete, onboarding gate) so the route and
 * service logic is exercised for real.
 */
function createFakeResultsRepository({ seedUser = {} } = {}) {
  const state = {
    user: {
      id: '1',
      telegramId: String(TELEGRAM_ID),
      firstName: 'Phase',
      photoUrl: null,
      name: null,
      email: null,
      city: 'Addis Ababa',
      onboardingCompleted: true,
      resultsCompleted: false,
      resultsViewedAt: null,
      profileScore: null,
      scoreTier: null,
      datingStyle: null,
      matchPoolCount: null,
      responseRateMultiplier: null,
      promoCode: null,
      promoDiscountPercent: null,
      answersHash: null,
      ...seedUser,
    },
    answers: { ...ANSWERS },
    promos: [],
  };

  const clone = (value) => (value === null || value === undefined ? value : JSON.parse(JSON.stringify(value)));

  return {
    isAvailable: true,
    state,

    async getResults() {
      if (!state.user) return null;
      return {
        user: clone({ ...state.user }),
        onboardingCompleted: state.user.onboardingCompleted,
        answers: clone(state.answers),
        answersHash: state.user.answersHash || null,
        promo: state.promos.length > 0 ? clone(state.promos[state.promos.length - 1]) : null,
      };
    },

    async saveResults(_telegramId, results) {
      Object.assign(state.user, {
        profileScore: results.score,
        scoreTier: results.scoreTier,
        answersHash: results.answersHash,
        matchPoolCount: results.matchPoolCount,
        datingStyle: results.datingStyle,
        responseRateMultiplier: results.responseRateMultiplier,
      });
      return clone(state.user);
    },

    async setEmail(_telegramId, email) {
      state.user.email = normaliseEmail(email);
      return clone(state.user);
    },

    async setName(_telegramId, name) {
      state.user.name = normaliseName(name);
      return clone(state.user);
    },

    async getPromo() {
      if (!state.user) return null;
      return {
        user: clone(state.user),
        promo: state.promos.length > 0 ? clone(state.promos[state.promos.length - 1]) : null,
      };
    },

    async createPromo(_telegramId, { code, discountPercent, expiresAt }) {
      const upper = code.toUpperCase();
      if (state.promos.some((promo) => promo.code === upper)) {
        const error = new Error('duplicate key value violates unique constraint "promo_codes_code_key"');
        error.code = '23505';
        throw error;
      }
      const promo = { code: upper, discountPercent, isUsed: false, expiresAt, createdAt: new Date() };
      state.promos.push(promo);
      state.user.promoCode = upper;
      state.user.promoDiscountPercent = discountPercent;
      return { user: clone(state.user), promo: clone(promo) };
    },

    async completeResults() {
      if (!state.user) return { status: 'not-found' };
      if (!state.user.onboardingCompleted) return { status: 'quiz-incomplete' };
      if (!normaliseName(state.user.name)) return { status: 'name-required' };
      state.user.resultsCompleted = true;
      state.user.resultsViewedAt = state.user.resultsViewedAt || new Date();
      return { status: 'ok', user: clone(state.user) };
    },
  };
}

const promoService = {
  generatePromoCode,
  promoExpiry: () => promoExpiry(new Date('2026-10-08T09:00:00.000Z')),
  discountPercent: 50,
  MAX_GENERATION_ATTEMPTS: 5,
};

let repository;
let server;
let baseUrl;

function buildApp(repo) {
  return createApp({
    runtimeConfig,
    userRepository: { isAvailable: true },
    onboardingRepository: {
      isAvailable: true,
      async getState() {
        return { answers: {}, currentStepKey: 'gender', currentStepIndex: 0, completed: false };
      },
    },
    resultsRepository: repo,
    resultsService: createResultsService({ resultsRepository: repo, promoService, secret: 'test-secret' }),
  });
}

before(async () => {
  repository = createFakeResultsRepository();
  const app = buildApp(repository);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function request(path, options = {}, initData = signedInitData()) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `tma ${initData}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

async function unavailableApp() {
  const emptyRepository = { isAvailable: false };
  const app = createApp({
    runtimeConfig,
    userRepository: { isAvailable: true },
    onboardingRepository: { isAvailable: true },
    resultsRepository: emptyRepository,
    resultsService: createResultsService({ resultsRepository: emptyRepository, promoService, secret: 'test-secret' }),
  });
  const temporary = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  return { temporary, url: `http://127.0.0.1:${temporary.address().port}` };
}

describe('results routes', () => {
  it('requires Telegram authentication', async () => {
    const response = await fetch(`${baseUrl}/api/onboarding/results`);
    assert.equal(response.status, 401);
  });

  it('reports 503 when persistence is not configured', async () => {
    const { temporary, url } = await unavailableApp();
    try {
      const response = await fetch(`${url}/api/onboarding/results/calculate-score`, {
        method: 'POST',
        headers: { Authorization: `tma ${signedInitData()}` },
      });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, 'DATABASE_UNAVAILABLE');
    } finally {
      await new Promise((resolve) => temporary.close(resolve));
    }
  });

  it('refuses to resume before the score exists', async () => {
    const response = await request('/api/onboarding/results');
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'SCORE_NOT_CALCULATED');
  });

  it('calculates a score from the stored answers', async () => {
    const response = await request('/api/onboarding/results/calculate-score', { method: 'POST' });
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.reused, false);
    assert.ok(body.results.score >= 65 && body.results.score <= 97, `score ${body.results.score} out of band`);
    assert.equal(body.results.scoreTier, body.results.score >= 85 ? 'VERY_HIGH' : 'HIGH');
    assert.equal(body.results.yourType, 'Natural, 25–30');
    assert.equal(body.results.datingStyle, 'Connector');
    assert.equal(body.results.responseRateMultiplier, 2.3);
    assert.equal(body.results.matchPoolCity, 'Addis Ababa');
    assert.ok(body.results.matchPoolCount >= 30 && body.results.matchPoolCount <= 70);
    assert.equal(body.results.fourWeekGoalLabel, 'One great first date');
    assert.equal(body.results.resultsCompleted, false);
  });

  it('returns the identical score on a second calculation instead of re-rolling it', async () => {
    const first = await (await request('/api/onboarding/results/calculate-score', { method: 'POST' })).json();
    const second = await (await request('/api/onboarding/results/calculate-score', { method: 'POST' })).json();
    assert.equal(second.reused, true);
    assert.equal(second.results.score, first.results.score);
    assert.equal(second.results.matchPoolCount, first.results.matchPoolCount);
  });

  it('resumes the full results payload once scored', async () => {
    const response = await request('/api/onboarding/results');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.results.score > 0);
    assert.equal(body.results.email, null);
    assert.equal(body.results.name, null);
  });

  it('accepts a valid email, lowercased and trimmed', async () => {
    const response = await request('/api/onboarding/results/email', {
      method: 'POST',
      body: JSON.stringify({ email: '  Abel@Example.COM ' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results.email, 'abel@example.com');
  });

  it('rejects a malformed email', async () => {
    for (const email of ['abel@', 'abel', '@example.com', 'abel @example.com', 'a'.repeat(330)]) {
      const response = await request('/api/onboarding/results/email', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      assert.equal(response.status, 422, `${email} should be rejected`);
      assert.equal((await response.json()).error.code, 'INVALID_EMAIL');
    }
  });

  it('treats a skipped email as success with no stored value', async () => {
    const response = await request('/api/onboarding/results/email', {
      method: 'POST',
      body: JSON.stringify({ email: null }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results.email, null);
  });

  it('requires a name of at least two characters', async () => {
    for (const name of ['', 'A', '   ', null, 42, 'x'.repeat(81)]) {
      const response = await request('/api/onboarding/results/name', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      assert.equal(response.status, 422, `${JSON.stringify(name)} should be rejected`);
      assert.equal((await response.json()).error.code, 'INVALID_NAME');
    }
  });

  it('stores a trimmed, whitespace-collapsed name', async () => {
    const response = await request('/api/onboarding/results/name', {
      method: 'POST',
      body: JSON.stringify({ name: '  Abel   Tesfaye ' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results.name, 'Abel Tesfaye');
  });

  it('blocks completion while the name is missing', async () => {
    const anonymous = createFakeResultsRepository();
    const app = buildApp(anonymous);
    const temporary = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const response = await fetch(`http://127.0.0.1:${temporary.address().port}/api/onboarding/results/complete`, {
        method: 'POST',
        headers: { Authorization: `tma ${signedInitData()}` },
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, 'NAME_REQUIRED');
    } finally {
      await new Promise((resolve) => temporary.close(resolve));
    }
  });

  it('generates a valid promo code once and reuses it afterwards', async () => {
    const first = await request('/api/onboarding/results/promo', { method: 'POST' });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(isValidPromoCode(firstBody.promo.code), true);
    assert.ok(firstBody.promo.code.startsWith(CODE_PREFIX));
    for (const character of firstBody.promo.code.slice(CODE_PREFIX.length)) {
      assert.ok(CODE_ALPHABET.includes(character));
    }
    assert.equal(firstBody.promo.discountPercent, 50);
    assert.equal(firstBody.promo.expiresAt, '2026-10-15T09:00:00.000Z');

    const second = await (await request('/api/onboarding/results/promo', { method: 'POST' })).json();
    assert.equal(second.promo.code, firstBody.promo.code);
    assert.equal(repository.state.promos.length, 1, 'must not insert a second code');
  });

  it('gives each user a different promo code', async () => {
    const other = createFakeResultsRepository();
    const app = buildApp(other);
    const temporary = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const response = await fetch(`http://127.0.0.1:${temporary.address().port}/api/onboarding/results/promo`, {
        method: 'POST',
        headers: { Authorization: `tma ${signedInitData(999000111)}` },
      });
      const body = await response.json();
      assert.notEqual(body.promo.code, repository.state.promos[0].code);
    } finally {
      await new Promise((resolve) => temporary.close(resolve));
    }
  });

  it('retries with a fresh code when the draw collides', async () => {
    const colliding = createFakeResultsRepository();
    const originalCreate = colliding.createPromo;
    let attempts = 0;
    colliding.createPromo = async (...args) => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('duplicate key');
        error.code = '23505';
        throw error;
      }
      return originalCreate(...args);
    };

    const service = createResultsService({ resultsRepository: colliding, promoService, secret: 'test-secret' });
    const outcome = await service.ensurePromo(TELEGRAM_ID);
    assert.equal(outcome.status, 'ok');
    assert.equal(attempts, 2);
  });

  it('reports unavailable after exhausting the retry budget', async () => {
    const alwaysColliding = createFakeResultsRepository();
    alwaysColliding.createPromo = async () => {
      const error = new Error('duplicate key');
      error.code = '23505';
      throw error;
    };

    const service = createResultsService({ resultsRepository: alwaysColliding, promoService, secret: 'test-secret' });
    const outcome = await service.ensurePromo(TELEGRAM_ID);
    assert.equal(outcome.status, 'unavailable');
  });

  it('completes the flow and returns the user for the app shell', async () => {
    const response = await request('/api/onboarding/results/complete', { method: 'POST' });
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.user.resultsCompleted, true);
    assert.ok(body.user.resultsViewedAt);
    assert.equal(body.results.name, 'Abel Tesfaye');
    assert.equal(repository.state.user.resultsCompleted, true);
  });

  it('keeps results_viewed_at stable when completion is repeated', async () => {
    const first = repository.state.user.resultsViewedAt;
    await request('/api/onboarding/results/complete', { method: 'POST' });
    assert.equal(repository.state.user.resultsViewedAt.getTime(), first.getTime());
  });

  it('does not shadow the Phase 2 onboarding routes', async () => {
    const response = await fetch(`${baseUrl}/api/onboarding`, {
      headers: { Authorization: `tma ${signedInitData()}` },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).onboarding.currentStepKey, 'gender');
  });

  it('rejects an unknown results path with the shared 404 shape', async () => {
    const response = await request('/api/onboarding/results/nope', { method: 'POST' });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  });
});
