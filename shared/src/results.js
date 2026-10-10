import { normalizeGender, onboardingQuestionByKey } from './onboarding.js';

/**
 * Phase 3 — post-onboarding conversion flow (spec section 4).
 * Config-driven exactly like the onboarding flow: screens, order, and copy live
 * here so the UI never hardcodes a switch over screens.
 */
export const resultsFlow = Object.freeze([
  {
    key: 'analyze-answers',
    kind: 'analysis',
    heading: 'Analyzing your answers...',
    durationMs: 5200,
    rows: Object.freeze([
      { key: 'about-you', label: 'About You' },
      { key: 'your-type', label: 'Your Type' },
      { key: 'lifestyle', label: 'Lifestyle' },
      { key: 'relationship-goals', label: 'Relationship Goals' },
      { key: 'match-potential', label: 'Match Potential' },
    ]),
    badges: Object.freeze([
      '✦ Telegram Mini App of the Year 2025',
      '▰ Top-10 Dating Apps, Google Play 2026',
    ]),
  },
  {
    key: 'candidate-search',
    kind: 'search',
    heading: 'Finding women who match your type...',
    durationMs: 5600,
    testimonials: Object.freeze([
      { quote: 'Met my girlfriend in 9 days', author: 'Samuel, 28', stars: 5 },
      { quote: 'Finally, real people.', author: 'Dawit, 31', stars: 5 },
      { quote: 'The first app where conversations actually go somewhere.', author: 'Nahom, 26', stars: 5 },
    ]),
    variants: {
      female: {
        heading: 'Finding men who match your type...',
        testimonials: [
          { quote: 'Met my boyfriend in 9 days', author: 'Hanna, 28', stars: 5 },
          { quote: 'Finally, real people.', author: 'Meron, 31', stars: 5 },
          { quote: 'The first app where conversations actually go somewhere.', author: 'Tsion, 26', stars: 5 },
        ],
      },
    },
  },
  {
    key: 'match-result',
    kind: 'result',
    heading: 'Here’s your dating profile',
    cta: 'CONTINUE',
  },
  {
    key: 'email',
    kind: 'email',
    heading: 'Enter your email to get your personalized Match Report and meet her',
    privacy: 'We respect your privacy and never share your email. Your Match Report stays between us.',
    placeholder: 'Your email',
    cta: 'CONTINUE',
    skipCta: 'SKIP THIS STEP',
    variants: {
      female: {
        heading: 'Enter your email to get your personalized Match Report and meet him',
      },
    },
  },
  {
    key: 'name',
    kind: 'name',
    heading: 'What’s your name?',
    placeholder: 'Your name',
    cta: 'CONTINUE',
  },
  {
    key: 'match-plan',
    kind: 'plan',
    headingSuffix: 'your 4-week Match Plan is ready',
    cta: 'CONTINUE',
    now: { perWeek: 2, label: 'Now' },
    later: { perWeek: 12, label: 'After 4 weeks' },
    disclaimer: 'This chart is for illustrative purposes only.',
    benefits: Object.freeze([
      { icon: '⭐', label: 'Perfect for your dating style' },
      { icon: '✓', label: 'Customized based on your answers' },
      { icon: '➤', label: 'Goal: One great first date' },
    ]),
    footnote: '*Based on Premium users with a similar profile. Results vary.',
  },
  {
    key: 'scratch-discount',
    kind: 'discount',
    heading: 'Scratch to reveal your special discount',
    subheading: 'We want you to start your journey with a nice surprise.',
    promoCode: 'dategram_oct26',
    percent: 50,
    cta: 'CONTINUE',
  },
]);

export const resultsStepByKey = new Map(resultsFlow.map((step) => [step.key, step]));

/**
 * Gender-conditional ("IF") results copy, mirroring the onboarding branch:
 * women see men/he/him copy, men see women/she/her copy.
 */
export function resolveResultsStep(step, gender) {
  const normalized = normalizeGender(gender);
  if (!normalized || !step) return step;
  const variant = step.variants?.[normalized];
  if (!variant) return step;
  return { ...step, ...variant };
}

export function getResultsFlowForGender(gender) {
  const normalized = normalizeGender(gender);
  return resultsFlow.map((step) => resolveResultsStep(step, normalized));
}

export const PROMO_CODE = 'dategram_oct26';
export const PROMO_PERCENT = 50;

function optionLabel(questionKey, answerId, fallback) {
  const question = onboardingQuestionByKey.get(questionKey);
  if (!question?.options) return fallback;
  const match = question.options.find((option) => option.id === answerId);
  return match?.label || fallback;
}

const datingStyleByEnergy = {
  life_of_party: 'Social Spark',
  small_groups: 'Connector',
  reserved: 'Slow Burner',
  depends: 'Free Spirit',
};

const responseMultiplierByConfidence = {
  never_know: 1.1,
  rare_replies: 1.6,
  confident: 2.3,
  prefer_her_first: 1.9,
};

const cityPoolBase = {
  'Addis Ababa': 57,
  Adama: 34,
  Hawassa: 29,
  'Bahir Dar': 26,
  'Dire Dawa': 24,
  Mekelle: 22,
};

/**
 * Deterministic, fully server-recomputable match result built from onboarding
 * answers. Never trust a client-supplied score: the API recomputes this from
 * the persisted answers (implementation rule 4).
 */
export function computeMatchResult(answers = {}) {
  let score = 68;

  if (Array.isArray(answers.looking_for) && answers.looking_for.includes('serious_relationship')) score += 5;
  if (Array.isArray(answers.what_matters) && answers.what_matters.includes('emotional_connection')) score += 3;
  if (answers.conversation_confidence === 'confident') score += 4;
  else if (answers.conversation_confidence === 'never_know') score -= 2;

  const readiness = optionLabel('date_readiness', answers.date_readiness, null);
  const readinessStep = onboardingQuestionByKey.get('date_readiness');
  const readinessEnergy = readinessStep?.options?.find((option) => option.id === answers.date_readiness)?.energy;
  if (Number.isInteger(readinessEnergy)) score += readinessEnergy * 2 - 3;
  void readiness;

  if (answers.four_week_goal === 'one_first_date') score += 4;
  if (answers.last_relationship === 'less_than_year') score += 1;

  score = Math.min(97, Math.max(35, score));

  const band = score < 45 ? 'low' : score < 62 ? 'average' : score < 82 ? 'high' : 'very-high';

  const preferredStyles = Array.isArray(answers.style_preference) ? answers.style_preference : [];
  const styleLabel = optionLabel('style_preference', preferredStyles[0], 'Natural');
  const ageLabel = optionLabel('age_range_preference', answers.age_range_preference, '25–30');

  const datingStyle = datingStyleByEnergy[answers.social_energy] || 'Connector';

  const city = answers.location?.name || 'Addis Ababa';
  const poolBase = cityPoolBase[city] ?? Math.max(12, Math.round(57 * 0.6));
  const answerFingerprint = JSON.stringify(answers).length % 7;
  const matchPool = poolBase + answerFingerprint;

  const responseMultiplier = responseMultiplierByConfidence[answers.conversation_confidence] ?? 1.6;
  const responseLabel = responseMultiplier >= 1.9 ? 'Above average' : 'Average';
  const poolNoun = normalizeGender(answers.gender) === 'female' ? 'men' : 'women';

  return {
    score,
    band,
    positionPercent: score,
    typeSummary: `${styleLabel}, ${ageLabel}`,
    datingStyle,
    matchPool,
    matchPoolLabel: `${matchPool} ${poolNoun} in ${city}`,
    responseMultiplier,
    responseLabel,
    generatedAt: new Date().toISOString(),
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export function validateEmail(rawEmail) {
  const email = String(rawEmail ?? '').trim();
  if (email.length === 0) return { valid: false, error: 'Enter your email to continue.' };
  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  return { valid: true, value: email };
}

export function validateDisplayName(rawName) {
  const name = String(rawName ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) return { valid: false, error: 'Tell us your name to continue.' };
  if (name.length > 60) return { valid: false, error: 'Name must be 60 characters or fewer.' };
  // eslint-disable-next-line no-control-regex
  if (/[<>\u0000-\u001f]/.test(name)) return { valid: false, error: 'Name contains unsupported characters.' };
  return { valid: true, value: name };
}

export function validatePromoCode(rawCode) {
  const code = String(rawCode ?? '').trim().toLowerCase();
  if (!code) return { valid: false, error: 'Enter a promo code.' };
  if (code !== PROMO_CODE) return { valid: false, error: 'This promo code is not valid.' };
  return { valid: true, value: code, percent: PROMO_PERCENT };
}
