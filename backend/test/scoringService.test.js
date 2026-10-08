import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requiredQuestionKeys, validateOnboardingAnswer } from '@dategram/shared/onboarding';
import {
  DEFAULT_DATING_STYLE,
  MATCH_POOL_MAX,
  MATCH_POOL_MIN,
  SCORE_CEILING,
  SCORE_FLOOR,
  answersHash,
  calculateProfileScore,
  estimateMatchPool,
  getDatingStyle,
  getFourWeekGoalLabel,
  getResponseRateMultiplier,
  getScoreTier,
  getYourType,
  isoWeekBucket,
} from '@dategram/shared/scoring';

const secret = 'test-scoring-secret';

/** A complete, valid answer set built from the real flow definition. */
function fullAnswers(overrides = {}) {
  const answers = {};
  for (const key of requiredQuestionKeys) {
    if (key === 'age') answers[key] = 29;
    else if (key === 'location') answers[key] = { id: 'addis-ababa-et', name: 'Addis Ababa', country: 'Ethiopia', region: 'Addis Ababa' };
    else if (key === 'gender') answers[key] = 'male';
    else answers[key] = null;
  }

  return {
    ...answers,
    used_dating_apps: 'yes',
    looking_for: ['serious_relationship'],
    what_matters: ['emotional_connection', 'supports_goals'],
    body_type_preference: ['athletic'],
    style_preference: ['natural'],
    last_relationship: 'one_to_two_years',
    dating_frequency: 'monthly',
    first_impression_priorities: ['smile'],
    age_range_preference: '25_30',
    distance_preference: 'same_city',
    conversation_confidence: 'confident',
    dating_app_frustrations: ['ghosting'],
    work_schedule: 'nine_to_five',
    weekend_style: 'socializing',
    social_energy: 'small_groups',
    ideal_first_date: 'coffee_walk',
    home_atmosphere: 'warm_caring',
    activity_level_preference: 'weekend_active',
    kids_preference: 'open_to_it',
    ambition_preference: 'balanced',
    common_interests: ['travel_discovery', 'movies_music'],
    dealbreakers: ['smoking'],
    shared_activities: ['travel'],
    meeting_barriers: ['work'],
    meeting_availability: ['weekends'],
    four_week_goal: 'one_first_date',
    date_readiness: 'ready_right_match',
    first_move_preference: 'i_do',
    ...overrides,
  };
}

describe('scoring service', () => {
  it('accepts every answer key the flow actually defines', () => {
    const answers = fullAnswers();
    for (const key of requiredQuestionKeys) {
      const validation = validateOnboardingAnswer(key, answers[key]);
      assert.equal(validation.valid, true, `${key} should be a valid fixture answer`);
    }
  });

  it('derives the score from real answer keys rather than a flat baseline', () => {
    const rich = calculateProfileScore(fullAnswers(), { userId: '1', secret });
    const sparse = calculateProfileScore(
      fullAnswers({
        what_matters: ['fun_spontaneity'],
        dealbreakers: ['none'],
        date_readiness: 'not_sure',
        looking_for: ['not_sure'],
        common_interests: ['sports_outdoors'],
        first_move_preference: 'she_can',
      }),
      { userId: '1', secret },
    );

    assert.ok(rich.score > sparse.score, 'richer answers must score higher');
    assert.ok(rich.contributions.thoughtfulness > sparse.contributions.thoughtfulness);
    assert.equal(rich.contributions.decisiveness, 3);
    assert.equal(sparse.contributions.decisiveness, 0);
    assert.equal(rich.contributions.readiness, 5);
    assert.equal(sparse.contributions.readiness, 0);
    assert.equal(rich.contributions.intentionality, 2);
    assert.equal(sparse.contributions.intentionality, 0);
  });

  it('returns the same score for the same answers and user every time', () => {
    const answers = fullAnswers();
    const first = calculateProfileScore(answers, { userId: '42', secret });
    const second = calculateProfileScore({ ...answers }, { userId: '42', secret });
    assert.equal(first.score, second.score);
    assert.equal(first.jitter, second.jitter);
  });

  it('varies by user and by answer set, so scores are not identical for everyone', () => {
    const answers = fullAnswers();
    const scores = new Set(
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(
        (userId) => calculateProfileScore(answers, { userId, secret }).score,
      ),
    );
    assert.ok(scores.size > 1, 'jitter must differentiate users');
  });

  it('clamps every reachable score into the believable band', () => {
    const extreme = fullAnswers({
      what_matters: ['travel_partner', 'emotional_connection', 'fun_spontaneity', 'building_family', 'supports_goals'],
      common_interests: ['traditional_values', 'home_comfort', 'travel_discovery', 'self_development', 'career_ambition'],
      date_readiness: 'ready_right_match',
      looking_for: ['serious_relationship'],
      dealbreakers: ['smoking'],
      first_move_preference: 'i_do',
    });
    const minimum = fullAnswers({
      what_matters: ['fun_spontaneity'],
      dealbreakers: ['none'],
      date_readiness: 'not_sure',
      looking_for: ['not_sure'],
      common_interests: ['sports_outdoors'],
      first_move_preference: 'she_can',
    });

    for (const answers of [extreme, minimum]) {
      for (const userId of ['1', '2', '3', '99', 'abc']) {
        const { score } = calculateProfileScore(answers, { userId, secret });
        assert.ok(score >= SCORE_FLOOR, `${score} below floor`);
        assert.ok(score <= SCORE_CEILING, `${score} above ceiling`);
      }
    }
  });

  it('maps score tiers at the documented boundaries', () => {
    assert.equal(getScoreTier(97), 'VERY_HIGH');
    assert.equal(getScoreTier(85), 'VERY_HIGH');
    assert.equal(getScoreTier(84), 'HIGH');
    assert.equal(getScoreTier(70), 'HIGH');
    assert.equal(getScoreTier(69), 'AVERAGE');
    assert.equal(getScoreTier(50), 'AVERAGE');
    assert.equal(getScoreTier(49), 'LOW');
  });

  it('maps every real conversation_confidence option to a distinct dating style', () => {
    assert.equal(getDatingStyle({ conversation_confidence: 'never_know' }), 'Thoughtful Starter');
    assert.equal(getDatingStyle({ conversation_confidence: 'rare_replies' }), 'Persistent');
    assert.equal(getDatingStyle({ conversation_confidence: 'confident' }), 'Connector');
    assert.equal(getDatingStyle({ conversation_confidence: 'prefer_her_first' }), 'Selective');
    assert.equal(getDatingStyle({}), DEFAULT_DATING_STYLE);
  });

  it('keeps the response-rate multiplier consistent with the dating style', () => {
    assert.equal(getResponseRateMultiplier('Connector'), 2.3);
    assert.equal(getResponseRateMultiplier('Selective'), 2.1);
    assert.equal(getResponseRateMultiplier('Thoughtful Starter'), 1.9);
    assert.equal(getResponseRateMultiplier('Persistent'), 1.6);
    assert.equal(getResponseRateMultiplier('Unknown'), 2.3);
  });

  it('composes "your type" from real style and age-range labels', () => {
    assert.equal(getYourType(fullAnswers()), 'Natural, 25–30');
    assert.equal(getYourType({ style_preference: ['elegant'], age_range_preference: '38_plus' }), 'Elegant, 38+');
    assert.equal(getYourType({}), 'Curated for you');
  });

  it('resolves the four-week goal label from the saved answer', () => {
    assert.equal(getFourWeekGoalLabel({ four_week_goal: 'one_first_date' }), 'One great first date');
    assert.equal(getFourWeekGoalLabel({ four_week_goal: 'back_out_there' }), 'Just getting back out there');
    assert.equal(getFourWeekGoalLabel({}), 'One great first date');
  });

  it('produces a stable answer hash that ignores key order', () => {
    const answers = fullAnswers();
    const reordered = Object.fromEntries(Object.keys(answers).reverse().map((key) => [key, answers[key]]));
    assert.equal(answersHash(answers), answersHash(reordered));
    assert.notEqual(answersHash(answers), answersHash(fullAnswers({ date_readiness: 'not_sure' })));
    assert.match(answersHash(answers), /^[a-f0-9]{32}$/);
  });

  it('keeps the match pool inside its band and stable within a week', () => {
    const now = new Date('2026-10-08T09:00:00Z');
    const first = estimateMatchPool({ userId: '7', city: 'Addis Ababa', secret, now });
    const second = estimateMatchPool({ userId: '7', city: 'Addis Ababa', secret, now: new Date('2026-10-10T18:00:00Z') });
    assert.equal(first, second, 'same user, city and week must give the same pool');
    assert.ok(first >= MATCH_POOL_MIN && first <= MATCH_POOL_MAX);

    const later = estimateMatchPool({ userId: '7', city: 'Addis Ababa', secret, now: new Date('2026-11-20T09:00:00Z') });
    assert.ok(later >= MATCH_POOL_MIN && later <= MATCH_POOL_MAX);

    const cities = new Set(
      ['Addis Ababa', 'Hawassa', 'Cairo'].map((city) => estimateMatchPool({ userId: '7', city, secret, now })),
    );
    assert.ok(cities.size > 1, 'pool should differ by city');
  });

  it('buckets weeks consistently for the pool drift', () => {
    assert.equal(isoWeekBucket(new Date('2026-10-05T00:00:00Z')), isoWeekBucket(new Date('2026-10-11T23:59:59Z')));
    assert.notEqual(isoWeekBucket(new Date('2026-10-11T23:59:59Z')), isoWeekBucket(new Date('2026-10-12T00:00:00Z')));
  });
});
