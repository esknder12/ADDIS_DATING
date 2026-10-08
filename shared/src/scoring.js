import { onboardingQuestionByKey } from './onboarding.js';

export const SCORE_FLOOR = 65;
export const SCORE_CEILING = 97;

const SCORE_TIERS = [
  { tier: 'VERY_HIGH', min: 85 },
  { tier: 'HIGH', min: 70 },
  { tier: 'AVERAGE', min: 50 },
];

const DATING_STYLES = {
  never_know: 'Thoughtful Starter',
  rare_replies: 'Persistent',
  confident: 'Connector',
  prefer_her_first: 'Selective',
};

const RESPONSE_RATE_BY_STYLE = {
  Connector: 2.3,
  Selective: 2.1,
  'Thoughtful Starter': 1.9,
  Persistent: 1.6,
};

export const DEFAULT_DATING_STYLE = 'Connector';
export const MATCH_POOL_MIN = 30;
export const MATCH_POOL_MAX = 70;

function clampScore(score) {
  return Math.max(SCORE_FLOOR, Math.min(SCORE_CEILING, score));
}

function optionLabel(questionKey, optionId) {
  const question = onboardingQuestionByKey.get(questionKey);
  if (!question) return null;
  const options = question.options || (question.groups || []).flatMap((group) => group.options);
  return options.find((option) => option.id === optionId)?.label || null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Portable non-cryptographic hashes (FNV-1a variants). The shared module runs in Node for the
 * API and in the browser for demo mode, so it cannot depend on `node:crypto`; Vite externalises
 * that import and the call would throw at runtime. Nothing here is a security boundary — the
 * numbers are marketing figures, and the secret only keeps them from being trivially guessed.
 */
function fnv32(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function fnv64Hex(input) {
  const padded = `${input}\u0000${input.length}`;
  const high = fnv32(`fnv64a:${padded}`).toString(16).padStart(8, '0');
  const low = fnv32(`fnv64b:${padded}`).toString(16).padStart(8, '0');
  return `${high}${low}${fnv32(`fnv64c:${padded}`).toString(16).padStart(8, '0')}${fnv32(`fnv64d:${padded}`).toString(16).padStart(8, '0')}`;
}

function deterministicInt(secret, message, modulus) {
  return fnv32(`${secret}|${message}`) % modulus;
}

/**
 * Canonicalise an answer set so the same answers always produce the same string,
 * regardless of key insertion order. Used to detect "answers changed, rescore".
 */
export function canonicaliseAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return '';

  return Object.keys(answers)
    .sort()
    .map((key) => `${key}=${JSON.stringify(answers[key])}`)
    .join('|');
}

export function answersHash(answers) {
  return fnv64Hex(canonicaliseAnswers(answers));
}

export function getScoreTier(score) {
  for (const entry of SCORE_TIERS) {
    if (score >= entry.min) return entry.tier;
  }
  return 'LOW';
}

export function getDatingStyle(answers) {
  return DATING_STYLES[answers?.conversation_confidence] || DEFAULT_DATING_STYLE;
}

export function getResponseRateMultiplier(datingStyle) {
  return RESPONSE_RATE_BY_STYLE[datingStyle] ?? RESPONSE_RATE_BY_STYLE[DEFAULT_DATING_STYLE];
}

export function getYourType(answers) {
  const style = toArray(answers?.style_preference)[0];
  const styleLabel = style ? optionLabel('style_preference', style) : null;
  const ageLabel = optionLabel('age_range_preference', answers?.age_range_preference);
  if (!styleLabel || !ageLabel) return 'Curated for you';
  return `${styleLabel}, ${ageLabel}`;
}

export function getFourWeekGoalLabel(answers) {
  return optionLabel('four_week_goal', answers?.four_week_goal) || 'One great first date';
}

function readinessBonus(dateReadiness) {
  if (dateReadiness === 'ready_right_match') return 5;
  if (dateReadiness === 'ready_rusty') return 3;
  if (dateReadiness === 'nervous_willing') return 1;
  return 0;
}

/**
 * Deterministic, believable profile score. Every signal reads a real answer key from
 * `shared/src/onboarding.js`; the jitter is derived from (secret, userId, answersHash) so a
 * reload never shows the user a different number than the one they were first shown.
 */
export function calculateProfileScore(answers = {}, { userId = '0', secret = 'dategram-scoring' } = {}) {
  const whatMatters = toArray(answers.what_matters);
  const dealbreakers = toArray(answers.dealbreakers);
  const lookingFor = toArray(answers.looking_for);
  const commonInterests = toArray(answers.common_interests);

  const contributions = {
    baseline: 70,
    thoughtfulness: Math.min(whatMatters.length * 2, 10),
    decisiveness: dealbreakers.length > 0 && !dealbreakers.includes('none') ? 3 : 0,
    readiness: readinessBonus(answers.date_readiness),
    intentionality: lookingFor.includes('serious_relationship') ? 2 : 0,
    investment: Math.min(commonInterests.length, 3),
    openness: answers.first_move_preference === 'i_do' || answers.first_move_preference === 'doesnt_matter' ? 1 : 0,
  };

  const subtotal = Object.values(contributions).reduce((total, value) => total + value, 0);
  const jitter = deterministicInt(secret, `${userId}|${answersHash(answers)}`, 7) - 3;

  return { score: clampScore(subtotal + jitter), contributions, jitter };
}

function isoWeekBucket(date = new Date()) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((target - firstThursday) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
  );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * MVP match pool: stable per (user, city, week) instead of random per request, so the number
 * on the result card cannot change when the screen is reloaded. Phase 5 replaces this with a
 * real COUNT(*) over active profiles.
 */
export function estimateMatchPool({ userId = '0', city = '', secret = 'dategram-scoring', now = new Date() } = {}) {
  const span = MATCH_POOL_MAX - MATCH_POOL_MIN + 1;
  const bucket = isoWeekBucket(now);
  return MATCH_POOL_MIN + deterministicInt(secret, `${userId}|${city}|${bucket}`, span);
}

export { isoWeekBucket };
