import { beforeEach, describe, expect, it } from 'vitest';
import {
  createResultsLocalStore,
  validateEmailInput,
  validateNameInput,
} from './resultsStores.js';

const ANSWERS = {
  conversation_confidence: 'never_know',
  style_preference: ['elegant'],
  age_range_preference: '30_38',
  four_week_goal: 'someone_again',
  date_readiness: 'ready_rusty',
  what_matters: ['emotional_connection', 'building_family'],
  dealbreakers: ['none'],
  looking_for: ['dating_and_seeing'],
  common_interests: ['travel_discovery'],
  first_move_preference: 'she_can',
};

function createStore() {
  return createResultsLocalStore({
    user: { telegramId: '4242', firstName: 'Abel', photoUrl: null, isDemo: true },
    readAnswers: () => ANSWERS,
  });
}

describe('results input validation', () => {
  it('accepts a well-formed email and normalises it', () => {
    expect(validateEmailInput('  Abel@Example.COM ')).toEqual({ valid: true, value: 'abel@example.com' });
  });

  it('treats an empty or missing email as a skip, not an error', () => {
    expect(validateEmailInput(null)).toEqual({ valid: true, value: null });
    expect(validateEmailInput('')).toEqual({ valid: true, value: null });
    expect(validateEmailInput('   ')).toEqual({ valid: true, value: null });
  });

  it('rejects malformed emails', () => {
    for (const email of ['abel@', 'abel', '@example.com', 'a b@example.com', 'a'.repeat(330), 42]) {
      expect(validateEmailInput(email).valid).toBe(false);
    }
  });

  it('requires a name of 2 to 80 characters and collapses whitespace', () => {
    expect(validateNameInput('  Abel   Tesfaye ')).toEqual({ valid: true, value: 'Abel Tesfaye' });
    expect(validateNameInput('Ab').valid).toBe(true);
    for (const name of ['', 'A', '   ', null, 42, 'x'.repeat(81)]) {
      expect(validateNameInput(name).valid, JSON.stringify(name)).toBe(false);
    }
  });
});

describe('local results store (demo mode)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('reports no results before the score has been calculated', async () => {
    const store = createStore();
    expect(await store.load()).toEqual({ results: null, user: null });
  });

  it('calculates a score from the demo answers and persists it', async () => {
    const store = createStore();
    const { results } = await store.calculate();

    expect(results.score).toBeGreaterThanOrEqual(65);
    expect(results.score).toBeLessThanOrEqual(97);
    expect(results.datingStyle).toBe('Thoughtful Starter');
    expect(results.responseRateMultiplier).toBe(1.9);
    expect(results.yourType).toBe('Elegant, 30–38');
    expect(results.fourWeekGoalLabel).toBe('Meeting someone I want to see again');
    expect(results.matchPoolCity).toBe('Addis Ababa');

    const reloaded = await store.load();
    expect(reloaded.results.score).toBe(results.score);
  });

  it('returns the same score on a repeat calculation', async () => {
    const store = createStore();
    const first = await store.calculate();
    const second = await store.calculate();
    expect(second.results.score).toBe(first.results.score);
    expect(second.results.matchPoolCount).toBe(first.results.matchPoolCount);
  });

  it('stores and skips email', async () => {
    const store = createStore();
    await store.calculate();

    const saved = await store.setEmail('ABEL@example.com');
    expect(saved.results.email).toBe('abel@example.com');

    const skipped = await store.setEmail(null);
    expect(skipped.results.email).toBe(null);
  });

  it('rejects an invalid email and an invalid name', async () => {
    const store = createStore();
    await expect(store.setEmail('nope')).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    await expect(store.setName('A')).rejects.toMatchObject({ code: 'INVALID_NAME' });
  });

  it('generates one promo code per user and reuses it', async () => {
    const store = createStore();
    const first = await store.getPromo();
    const second = await store.getPromo();

    expect(first.code).toMatch(/^DATEGRAM-[2-9A-HJ-NP-Z]{6}$/);
    expect(first.discountPercent).toBe(50);
    expect(second.code).toBe(first.code);

    const otherStore = createResultsLocalStore({
      user: { telegramId: '9999', isDemo: true },
      readAnswers: () => ANSWERS,
    });
    expect((await otherStore.getPromo()).code).not.toBe(first.code);
  });

  it('refuses to complete without a name, then completes with one', async () => {
    const store = createStore();
    await store.calculate();

    await expect(store.complete()).rejects.toMatchObject({ code: 'NAME_REQUIRED' });

    await store.setName('Abel');
    const user = await store.complete();
    expect(user.resultsCompleted).toBe(true);

    const reloaded = await store.load();
    expect(reloaded.results.resultsCompleted).toBe(true);
    expect(reloaded.results.resultsViewedAt).toBeTruthy();
  });
});
