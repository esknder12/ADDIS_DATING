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

function toResultsPayload(record, { answers = {} } = {}) {
  const { user, promo } = record;

  return {
    score: user.profileScore,
    scoreTier: user.scoreTier,
    yourType: getYourType(answers),
    datingStyle: user.datingStyle || getDatingStyle(answers),
    matchPoolCount: user.matchPoolCount,
    matchPoolCity: user.city || null,
    responseRateMultiplier: user.responseRateMultiplier,
    fourWeekGoalLabel: getFourWeekGoalLabel(answers),
    email: user.email,
    name: user.name,
    photoUrl: user.photoUrl,
    resultsViewedAt: user.resultsViewedAt,
    resultsCompleted: user.resultsCompleted,
    promo: promo
      ? {
        code: promo.code,
        discountPercent: promo.discountPercent,
        expiresAt: promo.expiresAt,
      }
      : null,
  };
}

export function createResultsService({ resultsRepository, promoService, secret = '' }) {
  /**
   * Calculate the profile score once and persist it. When the stored score was derived from
   * the same answer set, it is returned unchanged so a reload never shows a different number.
   */
  async function ensureScore(telegramId) {
    const record = await resultsRepository.getResults(telegramId);
    if (!record) return null;

    const hash = answersHash(record.answers);
    const { user } = record;

    if (user.profileScore !== null && user.scoreTier && user.matchPoolCount !== null && hash === record.answersHash) {
      return { record, reused: true };
    }

    const { score } = calculateProfileScore(record.answers, { userId: telegramId, secret });
    const datingStyle = getDatingStyle(record.answers);

    const savedUser = await resultsRepository.saveResults(telegramId, {
      score,
      scoreTier: getScoreTier(score),
      answersHash: hash,
      matchPoolCount: estimateMatchPool({ userId: telegramId, city: user.city || '', secret }),
      datingStyle,
      responseRateMultiplier: getResponseRateMultiplier(datingStyle),
    });
    if (!savedUser) return null;

    return { record: { ...record, user: savedUser }, reused: false };
  }

  async function getResults(telegramId) {
    const record = await resultsRepository.getResults(telegramId);
    return record ? toResultsPayload(record, { answers: record.answers }) : null;
  }

  async function calculateScore(telegramId) {
    const outcome = await ensureScore(telegramId);
    if (!outcome) return null;
    return { results: toResultsPayload(outcome.record, { answers: outcome.record.answers }), reused: outcome.reused };
  }

  async function setEmail(telegramId, email) {
    const user = await resultsRepository.setEmail(telegramId, email);
    if (!user) return null;
    const record = await resultsRepository.getResults(telegramId);
    return toResultsPayload({ ...record, user }, { answers: record.answers });
  }

  async function setName(telegramId, name) {
    const user = await resultsRepository.setName(telegramId, name);
    if (!user) return null;
    const record = await resultsRepository.getResults(telegramId);
    return toResultsPayload({ ...record, user }, { answers: record.answers });
  }

  /** Get-or-create: repeated visits to the discount screen must show the same code. */
  async function ensurePromo(telegramId) {
    const existing = await resultsRepository.getPromo(telegramId);
    if (!existing) return { status: 'not-found' };
    if (existing.promo) return { status: 'ok', promo: existing.promo };

    for (let attempt = 0; attempt < promoService.MAX_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const created = await resultsRepository.createPromo(telegramId, {
          code: promoService.generatePromoCode(),
          discountPercent: promoService.discountPercent,
          expiresAt: promoService.promoExpiry(),
        });
        if (!created) return { status: 'not-found' };
        return { status: 'ok', promo: created.promo };
      } catch (error) {
        // 23505 = unique_violation: another request took this code, draw a new one.
        if (error.code !== '23505') throw error;
      }
    }

    return { status: 'unavailable' };
  }

  async function complete(telegramId) {
    const outcome = await resultsRepository.completeResults(telegramId);
    if (outcome.status !== 'ok') return outcome;

    const record = await resultsRepository.getResults(telegramId);
    return {
      status: 'ok',
      user: outcome.user,
      results: toResultsPayload({ ...record, user: outcome.user }, { answers: record.answers }),
    };
  }

  return { ensureScore, getResults, calculateScore, setEmail, setName, ensurePromo, complete };
}

export { toResultsPayload };
