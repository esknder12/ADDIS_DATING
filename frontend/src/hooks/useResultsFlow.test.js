import { describe, expect, it } from 'vitest';
import { RESULTS_STEPS, resolveEntryStep } from './useResultsFlow.js';

const base = {
  score: 87,
  scoreTier: 'VERY_HIGH',
  email: null,
  name: null,
  resultsViewedAt: null,
  resultsCompleted: false,
  promo: null,
};

describe('results flow ordering', () => {
  it('runs the six conversion screens in the specified order', () => {
    expect(RESULTS_STEPS).toEqual(['analyzing', 'score', 'email', 'name', 'plan', 'discount']);
  });
});

describe('resolveEntryStep', () => {
  it('starts a fresh user on the analysis screen', () => {
    expect(resolveEntryStep(null)).toBe('analyzing');
    expect(resolveEntryStep({ ...base, score: null })).toBe('analyzing');
  });

  it('sends a scored but unstarted user to the result card', () => {
    expect(resolveEntryStep(base)).toBe('score');
  });

  it('skips the email step once an email is stored', () => {
    expect(resolveEntryStep({ ...base, email: 'abel@example.com' })).toBe('name');
  });

  it('skips straight to the plan once a name exists', () => {
    expect(resolveEntryStep({ ...base, email: 'abel@example.com', name: 'Abel' })).toBe('plan');
  });

  it('returns to the discount screen when the flow was interrupted before the code was issued', () => {
    expect(resolveEntryStep({ ...base, name: 'Abel', resultsViewedAt: '2026-10-08T09:00:00Z' })).toBe('discount');
  });

  it('does not replay the discount once the code exists', () => {
    const withPromo = {
      ...base,
      name: 'Abel',
      resultsViewedAt: '2026-10-08T09:00:00Z',
      promo: { code: 'DATEGRAM-ABC234', discountPercent: 50 },
    };
    expect(resolveEntryStep(withPromo)).toBe('plan');
  });

  it('never re-triggers the flow after completion without a promo, and lands on the plan with one', () => {
    expect(resolveEntryStep({ ...base, name: 'Abel', resultsCompleted: true })).toBe('discount');
    expect(
      resolveEntryStep({
        ...base,
        name: 'Abel',
        resultsCompleted: true,
        promo: { code: 'DATEGRAM-ABC234', discountPercent: 50 },
      }),
    ).toBe('plan');
  });
});
