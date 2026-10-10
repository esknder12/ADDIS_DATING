export const onboardingSections = [
  { id: 'about-you', label: 'About You', accent: '#ff6b86' },
  { id: 'your-type', label: 'Your Type', accent: '#d7a7ff' },
  { id: 'lifestyle', label: 'Lifestyle', accent: '#76d7ff' },
  { id: 'relationship-goals', label: 'Relationship Goals', accent: '#ffb876' },
  { id: 'almost-there', label: 'Almost There', accent: '#8ce6ae' },
];

/**
 * Gender-conditional ("IF") onboarding.
 *
 * The first question (`gender`) branches the rest of the journey:
 * - IF the user picks "Male"   -> he sees women/she/her copy.
 * - IF the user picks "Female" -> she sees men/he/him copy.
 *
 * Mechanisms that implement the branching:
 * 1. `variants: { male: {...}, female: {...} }` overrides copy (title, subtitle,
 *    body, options, stats, testimonials) per gender. The base copy is the male
 *    version; `resolveOnboardingStep(step, gender)` applies the override.
 * 2. `showFor: ['male'] | ['female']` hides a step from the other gender
 *    (e.g. `first_date_charm` vs `first_date_expectation`). Navigation skips
 *    hidden steps while raw step indices stay stable for the API.
 * 3. `showIf: { question, includes | equals }` hides a step unless an earlier
 *    answer matches (e.g. show a follow-up only when `what_matters` includes a
 *    given option). Navigation, progress counts, and completion all honour the
 *    same gate via `isStepVisible`.
 * Options can also carry `labelByGender` / `descriptionByGender` maps.
 */
export const GENDER_MALE = 'male';
export const GENDER_FEMALE = 'female';
export const GENDERS = Object.freeze([GENDER_MALE, GENDER_FEMALE]);

export function normalizeGender(value) {
  return value === GENDER_MALE || value === GENDER_FEMALE ? value : null;
}

/** Pronouns describing the people this user is looking for. */
export function pronounsFor(gender) {
  if (normalizeGender(gender) === GENDER_FEMALE) {
    return Object.freeze({
      subject: 'he',
      object: 'him',
      possessive: 'his',
      nounSingular: 'man',
      nounPlural: 'men',
    });
  }
  return Object.freeze({
    subject: 'she',
    object: 'her',
    possessive: 'hers',
    nounSingular: 'woman',
    nounPlural: 'women',
  });
}

const image = {
  social: '/images/onboarding-social.jpg',
  lifestyle: '/images/onboarding-lifestyle.jpg',
  professional: '/images/onboarding-professional.jpg',
  dinner: '/images/onboarding-dinner.jpg',
};

const rawFlow = [
  {
    key: 'gender',
    kind: 'question',
    section: 'about-you',
    input: 'single',
    layout: 'gender',
    showProgress: false,
    title: "What's your gender?",
    autoAdvance: true,
    options: [
      { id: 'male', label: 'Male', icon: '♂' },
      { id: 'female', label: 'Female', icon: '♀' },
    ],
  },
  {
    key: 'age',
    kind: 'question',
    section: 'about-you',
    input: 'number',
    layout: 'number',
    title: "What's your age?",
    min: 18,
    max: 100,
    suffix: 'years',
    note: 'Available only to adults 18 and over.',
  },
  {
    key: 'what_matters',
    kind: 'question',
    section: 'about-you',
    input: 'multi',
    layout: 'pills',
    title: 'What else matters to you?',
    subtitle: 'Choose all that apply',
    options: [
      { id: 'travel_partner', label: 'Someone to travel with', icon: '✈' },
      { id: 'emotional_connection', label: 'Emotional connection', icon: '♡' },
      { id: 'fun_spontaneity', label: 'Fun and spontaneity', icon: '✦' },
      { id: 'building_family', label: 'Building a family', icon: '⌂' },
      { id: 'supports_goals', label: 'A partner who supports my goals', icon: '⚑' },
    ],
  },
  {
    key: 'religion',
    kind: 'question',
    section: 'about-you',
    input: 'single',
    layout: 'pills',
    title: 'What is your religion?',
    autoAdvance: true,
    options: [
      { id: 'orthodox', label: 'Orthodox Christian', icon: '✝' },
      { id: 'protestant', label: 'Protestant', icon: '✝' },
      { id: 'catholic', label: 'Catholic', icon: '✝' },
      { id: 'muslim', label: 'Muslim', icon: '☪' },
      { id: 'traditional', label: 'Traditional', icon: '◍' },
      { id: 'other', label: 'Other', icon: '✦' },
      { id: 'prefer_not_say', label: 'Prefer not to say', icon: '×' },
    ],
  },
  {
    key: 'body_type_preference',
    kind: 'question',
    section: 'about-you',
    input: 'multi',
    layout: 'image-grid',
    title: 'Which body type do you find most attractive?',
    subtitle: 'Choose all that apply',
    options: [
      { id: 'slim', label: 'Slim', image: image.social, crop: 'social-left' },
      { id: 'athletic', label: 'Athletic', image: image.lifestyle, crop: 'lifestyle-wide' },
      { id: 'curvy', label: 'Curvy', image: image.social, crop: 'social-right' },
      { id: 'average', label: 'Average', image: image.lifestyle, crop: 'lifestyle-close' },
    ],
  },
  {
    key: 'style_preference',
    kind: 'question',
    section: 'about-you',
    input: 'multi',
    layout: 'image-grid',
    title: "What's your type?",
    subtitle: 'Choose all that apply',
    options: [
      { id: 'natural', label: 'Natural', image: image.lifestyle, crop: 'lifestyle-close' },
      { id: 'glamorous', label: 'Glamorous', image: image.social, crop: 'social-left' },
      { id: 'sporty', label: 'Sporty', image: image.lifestyle, crop: 'lifestyle-wide' },
      { id: 'elegant', label: 'Elegant', image: image.social, crop: 'social-right' },
    ],
  },
  {
    key: 'ten-minutes',
    kind: 'interstitial',
    section: 'about-you',
    variant: 'avatar-cluster',
    title: 'Just 10 minutes a day is enough.',
    body: "You don't need to swipe for hours. Our algorithm learns your type and brings the right women to you. You just pick who to talk to.",
    variants: {
      female: {
        body: "You don't need to swipe for hours. Our algorithm learns your type and brings the right men to you. You just pick who to talk to.",
      },
    },
  },

  {
    key: 'distance_preference',
    kind: 'question',
    section: 'your-type',
    input: 'single',
    layout: 'pills',
    title: 'How far should she live from you?',
    autoAdvance: true,
    variants: {
      female: { title: 'How far should he live from you?' },
    },
    options: [
      { id: 'same_neighborhood', label: 'Same neighborhood' },
      { id: 'same_city', label: 'Same city' },
      { id: 'within_100_km', label: 'Within 100 km' },
      { id: 'any_distance', label: "Distance doesn't matter" },
    ],
  },

  {
    key: 'occupation',
    kind: 'question',
    section: 'lifestyle',
    input: 'single',
    layout: 'pills',
    title: 'What do you do for work?',
    autoAdvance: true,
    options: [
      { id: 'student', label: 'Student', icon: '🎓' },
      { id: 'private_employee', label: 'Private company employee', icon: '💼' },
      { id: 'government', label: 'Government worker', icon: '🏛' },
      { id: 'business_owner', label: 'Business owner', icon: '🏪' },
      { id: 'freelancer', label: 'Freelancer', icon: '💻' },
      { id: 'healthcare', label: 'Healthcare worker', icon: '⚕' },
      { id: 'teacher', label: 'Teacher', icon: '📚' },
      { id: 'engineer_tech', label: 'Engineer / Tech', icon: '⚙' },
      { id: 'hospitality', label: 'Hospitality / Service', icon: '🍽' },
      { id: 'between_jobs', label: 'Between jobs', icon: '⌁' },
      { id: 'other', label: 'Other', icon: '✦' },
    ],
  },
  {
    key: 'work_schedule',
    kind: 'question',
    section: 'lifestyle',
    input: 'single',
    layout: 'pills',
    title: "What's your work schedule like?",
    autoAdvance: true,
    options: [
      { id: 'nine_to_five', label: '9 to 5', icon: '▰' },
      { id: 'flexible', label: 'Flexible hours', icon: '✎' },
      { id: 'night_shifts', label: 'Night shifts', icon: '☾' },
      { id: 'own_business', label: 'I run my own thing', icon: '▣' },
    ],
  },
  {
    key: 'home_atmosphere',
    kind: 'question',
    section: 'lifestyle',
    input: 'single',
    layout: 'hero-grid',
    title: 'What atmosphere should you two have at home?',
    autoAdvance: true,
    heroImage: image.lifestyle,
    options: [
      { id: 'warm_caring', label: 'Warm and caring' },
      { id: 'independent_busy', label: 'Independent and busy' },
      { id: 'playful_fun', label: 'Playful and fun' },
      { id: 'calm_grounded', label: 'Calm and grounded' },
    ],
  },

  {
    key: 'activity_level_preference',
    kind: 'question',
    section: 'relationship-goals',
    input: 'single',
    layout: 'hero-grid',
    title: 'How active should she be?',
    autoAdvance: true,
    heroImage: image.social,
    variants: {
      female: { title: 'How active should he be?' },
    },
    options: [
      { id: 'very_sporty', label: 'Very sporty' },
      { id: 'weekend_active', label: 'Active on weekends' },
      { id: 'occasional_walks', label: 'Chill, occasional walks' },
      { id: 'doesnt_matter', label: "Doesn't matter to me" },
    ],
  },
  {
    key: 'kids_preference',
    kind: 'question',
    section: 'relationship-goals',
    input: 'single',
    layout: 'hero-grid',
    title: 'Kids in the picture?',
    autoAdvance: true,
    heroImage: image.social,
    options: [
      { id: 'want_together', label: 'Want kids together' },
      { id: 'open_to_it', label: 'Open to it' },
      {
        id: 'already_have_open',
        label: 'Already have, open to hers',
        labelByGender: { female: 'Already have, open to his' },
      },
      { id: 'prefer_none', label: 'Prefer no kids' },
    ],
  },
  {
    key: 'religion_preference',
    kind: 'question',
    section: 'relationship-goals',
    input: 'single',
    layout: 'pills',
    title: 'Should your match share your religion?',
    autoAdvance: true,
    options: [
      { id: 'same_religion', label: 'Yes, same religion', icon: '✝' },
      { id: 'same_faith_family', label: 'Same faith family is fine', icon: '♡' },
      { id: 'respect_mine', label: 'Different is fine if they respect mine', icon: '⚖' },
      { id: 'doesnt_matter', label: "Doesn't matter", icon: '×' },
    ],
  },
  {
    key: 'common_interests',
    kind: 'question',
    section: 'relationship-goals',
    input: 'multi',
    layout: 'categorized',
    title: 'What should you have in common?',
    subtitle: 'Choose all that apply',
    groups: [
      {
        label: 'HOME & FAMILY',
        options: [
          { id: 'traditional_values', label: 'Traditional values', description: 'family, stability, loyalty', icon: '⚭' },
          { id: 'home_comfort', label: 'Home & comfort', description: 'cosy evenings, cooking together', icon: '⌂' },
        ],
      },
      {
        label: 'ADVENTURE & GROWTH',
        options: [
          { id: 'travel_discovery', label: 'Travel & discovery', description: 'new cities, new food', icon: '✈' },
          { id: 'self_development', label: 'Self-development', description: 'books, courses, growth', icon: '▤' },
          { id: 'career_ambition', label: 'Career & ambition', description: 'goals, business, hustle', icon: '▣' },
        ],
      },
      {
        label: 'LEISURE & CULTURE',
        options: [
          { id: 'sports_outdoors', label: 'Sports & outdoors', description: 'gym, hiking, running', icon: '△' },
          { id: 'movies_music', label: 'Movies & music', description: 'cinema nights, concerts', icon: '▷' },
          { id: 'nightlife_fun', label: 'Nightlife & fun', description: 'bars, parties, friends', icon: '♪' },
        ],
      },
    ],
  },
  {
    key: 'algorithm-work',
    kind: 'interstitial',
    section: 'relationship-goals',
    variant: 'algorithm',
    title: 'Our algorithm does the hard part.',
    body: 'Our compatibility engine scores every profile on 60+ factors from your answers. 83% of Premium users get a first date within 2 weeks.',
  },
  {
    key: 'dealbreakers',
    kind: 'question',
    section: 'relationship-goals',
    input: 'multi',
    layout: 'pills',
    title: 'Any dealbreakers?',
    subtitle: 'Choose all that apply',
    exclusiveOption: 'none',
    options: [
      { id: 'smoking', label: 'Smoking', icon: '⌁' },
      { id: 'no_relationship', label: "Doesn't want a relationship", icon: '⊘' },
      { id: 'too_far', label: 'Lives too far', icon: '⌖' },
      { id: 'different_values', label: 'Very different values', icon: '⚖' },
      { id: 'none', label: 'None of the above', icon: '×' },
    ],
  },

  {
    key: 'location',
    kind: 'question',
    section: 'almost-there',
    input: 'location',
    layout: 'location',
    title: 'Where do you live?',
  },
  {
    key: 'photos',
    kind: 'question',
    section: 'almost-there',
    input: 'photos',
    layout: 'photos',
    title: 'Add a photo',
    subtitle: 'Choose a clear photo where your face is easy to see.',
    minPhotos: 1,
    maxPhotos: 3,
  },
  {
    key: 'bio',
    kind: 'question',
    section: 'almost-there',
    input: 'text',
    layout: 'bio',
    title: 'Tell us a little about yourself',
    subtitle: 'A couple of sentences is enough to start a conversation.',
    placeholder: 'For example: I love long walks and know the best breakfast spot...',
    minLength: 2,
    maxLength: 500,
  },
];

function baseOptionsFor(step) {
  if (step.options) return step.options;
  if (step.groups) return step.groups.flatMap((group) => group.options);
  return [];
}

/** Every accepted option ID for a question, across all gender variants. */
function optionsFor(step) {
  const options = [...baseOptionsFor(step)];
  for (const gender of GENDERS) {
    const variant = step.variants?.[gender];
    if (!variant) continue;
    if (variant.options) options.push(...variant.options);
    if (variant.groups) {
      for (const group of variant.groups) options.push(...group.options);
    }
  }
  return options;
}

function resolveOptionLabels(options, gender) {
  if (!options) return options;
  return options.map((option) => {
    const label = option.labelByGender?.[gender];
    const description = option.descriptionByGender?.[gender];
    if (label === undefined && description === undefined) return option;
    return {
      ...option,
      label: label ?? option.label,
      description: description ?? option.description,
    };
  });
}

function resolveGroups(groups, gender) {
  if (!groups) return groups;
  return groups.map((group) => ({
    ...group,
    options: resolveOptionLabels(group.options, gender),
  }));
}

/**
 * Progress metadata recomputed per gender so section counters ("question 3 of
 * 7") stay correct when a gender skips `showFor` steps. The raw flow keeps the
 * union metadata for backwards compatibility.
 */
function computeProgressMeta(steps) {
  const totals = {};
  for (const step of steps) {
    if (step.kind === 'question' && step.showProgress !== false) {
      totals[step.section] = (totals[step.section] || 0) + 1;
    }
  }
  const seen = {};
  let questionIndex = 0;
  const meta = new Map();
  for (const step of steps) {
    if (step.kind !== 'question') continue;
    questionIndex += 1;
    const showProgress = step.showProgress !== false;
    if (showProgress) seen[step.section] = (seen[step.section] || 0) + 1;
    meta.set(step.key, {
      questionIndex,
      sectionQuestionIndex: showProgress ? seen[step.section] : 0,
      sectionQuestionCount: totals[step.section],
    });
  }
  return meta;
}

const progressMetaByGender = {
  [GENDER_MALE]: computeProgressMeta(
    rawFlow.filter((step) => !step.showFor || step.showFor.includes(GENDER_MALE)),
  ),
  [GENDER_FEMALE]: computeProgressMeta(
    rawFlow.filter((step) => !step.showFor || step.showFor.includes(GENDER_FEMALE)),
  ),
};

/** IF-gate: is this step part of the given gender's journey? */
export function isStepVisibleForGender(step, gender) {
  const normalized = normalizeGender(gender);
  if (!normalized) return true;
  if (!step?.showFor) return true;
  return step.showFor.includes(normalized);
}

/**
 * IF-gate: does the `showIf` condition match the answers so far?
 * Conditions reference an earlier question (`{ question, includes | equals }`).
 * `includes` matches multi-select membership (or scalar equality); `equals`
 * matches a scalar (or a multi-select member). Steps without `showIf` always
 * pass.
 */
export function isStepVisibleForAnswers(step, answers) {
  const condition = step?.showIf;
  if (!condition) return true;
  const value = answers?.[condition.question];
  if (condition.includes !== undefined) {
    return Array.isArray(value)
      ? value.includes(condition.includes)
      : value === condition.includes;
  }
  if (condition.equals !== undefined) {
    return Array.isArray(value)
      ? value.includes(condition.equals)
      : value === condition.equals;
  }
  return true;
}

/** Combined IF-gate: gender (`showFor`) and earlier answers (`showIf`). */
export function isStepVisible(step, gender, answers) {
  return isStepVisibleForGender(step, gender) && isStepVisibleForAnswers(step, answers);
}

/**
 * Resolve a step for a gender: applies the `variants` copy override, resolves
 * gendered option labels, and attaches gender-correct progress metadata.
 * Pass `answers` so progress counts also exclude answer-hidden (`showIf`) steps
 * (the lifestyle counter shrinks when `home_atmosphere` is skipped).
 * Unknown/null gender returns the step unchanged (base copy).
 */
export function resolveOnboardingStep(step, gender, answers = undefined) {
  const normalized = normalizeGender(gender);
  if (!normalized || !step) return step;
  const variant = step.variants?.[normalized] || {};
  const resolved = { ...step, ...variant };

  const options = variant.options || step.options;
  if (options) resolved.options = resolveOptionLabels(options, normalized);
  const groups = variant.groups || step.groups;
  if (groups) resolved.groups = resolveGroups(groups, normalized);

  if (resolved.kind === 'question') {
    const meta = answers === undefined
      ? progressMetaByGender[normalized].get(step.key)
      : computeProgressMeta(
        rawFlow.filter((candidate) => isStepVisible(candidate, normalized, answers)),
      ).get(step.key);
    if (meta) Object.assign(resolved, meta);
  }
  return resolved;
}

const sectionQuestionTotals = rawFlow.reduce((totals, step) => {
  if (step.kind === 'question' && step.showProgress !== false) {
    totals[step.section] = (totals[step.section] || 0) + 1;
  }
  return totals;
}, {});

const sectionSeen = {};
let globalQuestionIndex = 0;

export const onboardingFlow = rawFlow.map((step, stepIndex) => {
  if (step.kind !== 'question') {
    return Object.freeze({ ...step, stepIndex });
  }

  const showProgress = step.showProgress !== false;
  if (showProgress) sectionSeen[step.section] = (sectionSeen[step.section] || 0) + 1;
  globalQuestionIndex += 1;

  return Object.freeze({
    ...step,
    options: step.options ? Object.freeze(step.options) : undefined,
    stepIndex,
    questionIndex: globalQuestionIndex,
    sectionQuestionIndex: showProgress ? sectionSeen[step.section] : 0,
    sectionQuestionCount: sectionQuestionTotals[step.section],
  });
});

export const questionSteps = onboardingFlow.filter((step) => step.kind === 'question');
export const requiredQuestionKeys = questionSteps.map((step) => step.key);
export const totalQuestionCount = questionSteps.length;
export const onboardingStepByKey = new Map(onboardingFlow.map((step) => [step.key, step]));
export const onboardingQuestionByKey = new Map(questionSteps.map((step) => [step.key, step]));

/** The journey a gender actually walks: visible steps with resolved copy. */
export function getVisibleSteps(gender) {
  const normalized = normalizeGender(gender);
  return onboardingFlow
    .filter((step) => isStepVisibleForGender(step, normalized))
    .map((step) => resolveOnboardingStep(step, normalized));
}

/** Required answers for a gender's journey (unknown gender -> every key). */
export function getRequiredKeysForGender(gender) {
  const normalized = normalizeGender(gender);
  if (!normalized) return [...requiredQuestionKeys];
  return questionSteps
    .filter((step) => isStepVisibleForGender(step, normalized))
    .map((step) => step.key);
}

/**
 * Required answers for the journey these answers unlock: the gender filter
 * plus every `showIf` gate (e.g. `home_atmosphere` is required only when
 * `looking_for` includes "Serious relationship").
 */
export function getRequiredKeysForAnswers(answers) {
  const gender = normalizeGender(answers?.gender);
  return questionSteps
    .filter((step) => isStepVisible(step, gender, answers))
    .map((step) => step.key);
}

export function getQuestionCountForGender(gender) {
  return getRequiredKeysForGender(gender).length;
}

export const locationSuggestions = [
  { id: 'addis-ababa-et', name: 'Addis Ababa', country: 'Ethiopia', region: 'Addis Ababa' },
  { id: 'adama-et', name: 'Adama', country: 'Ethiopia', region: 'Oromia' },
  { id: 'hawassa-et', name: 'Hawassa', country: 'Ethiopia', region: 'Sidama' },
  { id: 'bahir-dar-et', name: 'Bahir Dar', country: 'Ethiopia', region: 'Amhara' },
  { id: 'dire-dawa-et', name: 'Dire Dawa', country: 'Ethiopia', region: 'Dire Dawa' },
  { id: 'mekelle-et', name: 'Mekelle', country: 'Ethiopia', region: 'Tigray' },
  { id: 'tokyo-jp', name: 'Tokyo', country: 'Japan', region: 'Tokyo' },
  { id: 'cairo-eg', name: 'Cairo', country: 'Egypt', region: 'Cairo' },
  { id: 'hong-kong-hk', name: 'Hong Kong', country: 'Hong Kong', region: 'Hong Kong' },
  { id: 'singapore-sg', name: 'Singapore', country: 'Singapore', region: 'Singapore' },
  { id: 'adissan-fr', name: 'Adissan', country: 'France', region: 'Occitanie' },
  { id: 'adiserai-id', name: 'Adiserai', country: 'Indonesia', region: 'Papua' },
  { id: 'adis-kidame-et', name: "Ādis K'idamē", country: 'Ethiopia', region: 'Amhara' },
];

function validationFailure(message) {
  return { valid: false, error: message };
}

export function validateOnboardingAnswer(questionKey, rawAnswer) {
  const question = onboardingQuestionByKey.get(questionKey);
  if (!question) return validationFailure('Unknown onboarding question.');

  if (question.input === 'single') {
    const validIds = new Set(optionsFor(question).map((option) => option.id));
    if (typeof rawAnswer !== 'string' || !validIds.has(rawAnswer)) {
      return validationFailure('Choose one of the available options.');
    }
    return { valid: true, value: rawAnswer };
  }

  if (question.input === 'multi') {
    const validIds = new Set(optionsFor(question).map((option) => option.id));
    if (!Array.isArray(rawAnswer)) return validationFailure('Choose at least one option.');

    const value = [...new Set(rawAnswer)];
    if (value.length < 1 || value.some((answer) => typeof answer !== 'string' || !validIds.has(answer))) {
      return validationFailure('Choose at least one valid option.');
    }
    if (question.exclusiveOption && value.includes(question.exclusiveOption) && value.length > 1) {
      return validationFailure('The “none” option cannot be combined with another option.');
    }
    return { valid: true, value };
  }

  if (question.input === 'number') {
    const value = Number(rawAnswer);
    if (!Number.isInteger(value) || value < question.min || value > question.max) {
      return validationFailure(`Enter a whole number from ${question.min} to ${question.max}.`);
    }
    return { valid: true, value };
  }

  if (question.input === 'location') {
    if (!rawAnswer || typeof rawAnswer !== 'object' || Array.isArray(rawAnswer)) {
      return validationFailure('Choose a city from the suggestions.');
    }
    const knownLocation = locationSuggestions.find((location) => location.id === rawAnswer.id);
    if (!knownLocation) return validationFailure('Choose a supported city from the suggestions.');
    return { valid: true, value: knownLocation };
  }

  if (question.input === 'photos') {
    const minPhotos = question.minPhotos ?? 1;
    const maxPhotos = question.maxPhotos ?? 3;
    if (!Array.isArray(rawAnswer)) return validationFailure('Add at least one photo to continue.');
    const items = rawAnswer.filter(Boolean);
    if (items.length < minPhotos) return validationFailure('Add at least one photo to continue.');
    if (items.length > maxPhotos) {
      return validationFailure(`You can add up to ${maxPhotos} photos here.`);
    }
    const value = [];
    for (const item of items) {
      const url = typeof item === 'string' ? item : item?.url;
      const id = typeof item === 'object' && item !== null ? item.id : undefined;
      if (typeof url !== 'string' || url.length < 8 || url.length > 1_000_000) {
        return validationFailure('Each photo must be a valid uploaded image.');
      }
      if (!/^(https?:\/\/|data:image\/)/.test(url)) {
        return validationFailure('Each photo must be a valid uploaded image.');
      }
      value.push(id === undefined ? { url } : { id, url });
    }
    return { valid: true, value };
  }

  if (question.input === 'text') {
    const minLength = question.minLength ?? 2;
    const maxLength = question.maxLength ?? 500;
    const value = String(rawAnswer ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
    if (value.length < minLength) {
      return validationFailure('Tell us a little about yourself to continue.');
    }
    if (value.length > maxLength) {
      return validationFailure(`Keep it under ${maxLength} characters.`);
    }
    return { valid: true, value };
  }

  return validationFailure('This answer type is not supported.');
}

export function isOnboardingComplete(answers) {
  const keys = getRequiredKeysForAnswers(answers);
  return keys.every((key) => validateOnboardingAnswer(key, answers?.[key]).valid);
}

export function getSection(sectionId) {
  return onboardingSections.find((section) => section.id === sectionId) || onboardingSections[0];
}
