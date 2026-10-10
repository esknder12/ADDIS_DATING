import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getQuestionCountForGender,
  getRequiredKeysForAnswers,
  getRequiredKeysForGender,
  getVisibleSteps,
  isOnboardingComplete,
  isStepVisible,
  isStepVisibleForAnswers,
  isStepVisibleForGender,
  locationSuggestions,
  normalizeGender,
  onboardingFlow,
  onboardingStepByKey,
  pronounsFor,
  questionSteps,
  requiredQuestionKeys,
  resolveOnboardingStep,
  totalQuestionCount,
  validateOnboardingAnswer,
} from '@dategram/shared/onboarding';
import {
  computeMatchResult,
  getResultsFlowForGender,
} from '@dategram/shared/results';

function firstValidAnswer(question) {
  if (question.input === 'single') return question.options[0].id;
  if (question.input === 'multi') {
    const options = question.options || question.groups.flatMap((group) => group.options);
    return [options[0].id];
  }
  if (question.input === 'number') return 26;
  if (question.input === 'location') return locationSuggestions[0];
  if (question.input === 'photos') return [{ url: 'https://example.com/photo.jpg' }];
  if (question.input === 'text') return 'I love long walks and the best breakfast spots.';
  throw new Error(`Unsupported question type: ${question.input}`);
}

function completeAnswersFor(gender) {
  const answers = {};
  for (const key of getRequiredKeysForGender(gender)) {
    const question = questionSteps.find((step) => step.key === key);
    answers[key] = firstValidAnswer(question);
  }
  answers.gender = gender;
  return answers;
}

describe('onboarding configuration', () => {
  it('contains the complete five-section flow with stable unique keys', () => {
    assert.equal(totalQuestionCount, 18);
    assert.equal(questionSteps.length, 18);
    assert.equal(onboardingFlow.length, 20);
    assert.equal(new Set(onboardingFlow.map((step) => step.key)).size, onboardingFlow.length);
    assert.equal(new Set(requiredQuestionKeys).size, totalQuestionCount);
  });

  it('gives every gender an 18-question journey', () => {
    assert.equal(getQuestionCountForGender('male'), 18);
    assert.equal(getQuestionCountForGender('female'), 18);
    assert.equal(getRequiredKeysForGender('male').length, 18);
    assert.equal(getRequiredKeysForGender('female').length, 18);
    assert.equal(
      getVisibleSteps('male').filter((step) => step.kind === 'question').length,
      18,
    );
    assert.equal(
      getVisibleSteps('female').filter((step) => step.kind === 'question').length,
      18,
    );
  });

  it('accepts one valid answer for every configured question', () => {
    const answers = {};
    for (const question of questionSteps) {
      const answer = firstValidAnswer(question);
      const result = validateOnboardingAnswer(question.key, answer);
      assert.equal(result.valid, true, `${question.key}: ${result.error || 'invalid'}`);
      answers[question.key] = result.value;
    }
    assert.equal(isOnboardingComplete(answers), true);
  });

  it('rejects invalid choices, underage users, and unknown locations', () => {
    assert.equal(validateOnboardingAnswer('gender', 'other-value').valid, false);
    assert.equal(validateOnboardingAnswer('age', 17).valid, false);
    assert.equal(validateOnboardingAnswer('age', 26.5).valid, false);
    assert.equal(validateOnboardingAnswer('location', {
      id: 'invented-city',
      name: 'Invented',
      country: 'Nowhere',
    }).valid, false);
  });

  it('enforces mutually exclusive none options', () => {
    const result = validateOnboardingAnswer('dealbreakers', ['smoking', 'none']);
    assert.equal(result.valid, false);
    assert.match(result.error, /cannot be combined/i);
  });

  it('deduplicates repeated multi-select values', () => {
    const result = validateOnboardingAnswer('what_matters', [
      'emotional_connection',
      'emotional_connection',
    ]);
    assert.deepEqual(result, { valid: true, value: ['emotional_connection'] });
  });
});

describe('gender-conditional (IF) onboarding', () => {
  it('asks gender as "Male" / "Female"', () => {
    const gender = onboardingStepByKey.get('gender');
    assert.deepEqual(
      gender.options.map((option) => option.label),
      ['Male', 'Female'],
    );
    assert.equal(validateOnboardingAnswer('gender', 'male').valid, true);
    assert.equal(validateOnboardingAnswer('gender', 'female').valid, true);
  });

  it('normalizes gender values and exposes match pronouns', () => {
    assert.equal(normalizeGender('male'), 'male');
    assert.equal(normalizeGender('female'), 'female');
    assert.equal(normalizeGender('other'), null);
    assert.equal(normalizeGender(undefined), null);
    assert.deepEqual(pronounsFor('male'), {
      subject: 'she',
      object: 'her',
      possessive: 'hers',
      nounSingular: 'woman',
      nounPlural: 'women',
    });
    assert.deepEqual(pronounsFor('female'), {
      subject: 'he',
      object: 'him',
      possessive: 'his',
      nounSingular: 'man',
      nounPlural: 'men',
    });
  });

  it('resolves he/him copy for women and she/her copy for men', () => {
    const distance = onboardingStepByKey.get('distance_preference');
    assert.equal(
      resolveOnboardingStep(distance, 'male').title,
      'How far should she live from you?',
    );
    assert.equal(
      resolveOnboardingStep(distance, 'female').title,
      'How far should he live from you?',
    );

    const activity = onboardingStepByKey.get('activity_level_preference');
    assert.equal(
      resolveOnboardingStep(activity, 'female').title,
      'How active should he be?',
    );

    const kids = onboardingStepByKey.get('kids_preference');
    const find = (step, gender) => resolveOnboardingStep(step, gender)
      .options.find((option) => option.id === 'already_have_open');
    assert.equal(find(kids, 'male').label, 'Already have, open to hers');
    assert.equal(find(kids, 'female').label, 'Already have, open to his');
  });

  it('completes each gender journey with all questions answered', () => {
    assert.equal(isOnboardingComplete(completeAnswersFor('male')), true);
    assert.equal(isOnboardingComplete(completeAnswersFor('female')), true);
  });
});

describe('answer-conditional (IF) onboarding', () => {
  // No configured step uses `showIf` today; the mechanism stays covered with a
  // synthetic step so a future conditional question only needs its config.
  const conditionalStep = {
    key: 'conditional_follow_up',
    kind: 'question',
    showFor: ['male'],
    showIf: { question: 'what_matters', includes: 'building_family' },
  };

  it('hides showIf steps until the earlier answer matches', () => {
    const yes = { gender: 'male', what_matters: ['building_family', 'travel_partner'] };
    const no = { gender: 'male', what_matters: ['travel_partner'] };
    assert.equal(isStepVisibleForAnswers(conditionalStep, yes), true);
    assert.equal(isStepVisibleForAnswers(conditionalStep, no), false);
    assert.equal(isStepVisibleForAnswers(conditionalStep, { gender: 'male' }), false);
    // Steps without `showIf` are always visible.
    assert.equal(isStepVisibleForAnswers(onboardingStepByKey.get('home_atmosphere'), no), true);
  });

  it('combines the gender and answer gates', () => {
    const yes = { gender: 'male', what_matters: ['building_family'] };
    assert.equal(isStepVisible(conditionalStep, 'male', yes), true);
    assert.equal(isStepVisible(conditionalStep, 'female', yes), false);
    const maleOnlyStep = { key: 'male_only', kind: 'question', showFor: ['male'] };
    assert.equal(isStepVisible(maleOnlyStep, 'male', yes), true);
    assert.equal(isStepVisible(maleOnlyStep, 'female', yes), false);
  });

  it('keeps home_atmosphere unconditional and required on every journey', () => {
    const missing = completeAnswersFor('male');
    delete missing.home_atmosphere;
    assert.ok(getRequiredKeysForAnswers(missing).includes('home_atmosphere'));
    assert.equal(isOnboardingComplete(missing), false);

    // Progress metadata is identical with or without answers while no step is
    // answer-conditional.
    const home = onboardingStepByKey.get('home_atmosphere');
    assert.equal(
      resolveOnboardingStep(home, 'male').sectionQuestionCount,
      resolveOnboardingStep(home, 'male', missing).sectionQuestionCount,
    );
  });
});

describe('religion and work questions', () => {
  it('validates the religion question options', () => {
    for (const id of ['orthodox', 'protestant', 'catholic', 'muslim', 'traditional', 'other', 'prefer_not_say']) {
      assert.equal(validateOnboardingAnswer('religion', id).valid, true, id);
    }
    assert.equal(validateOnboardingAnswer('religion', 'invented').valid, false);
  });

  it('validates the work (occupation) question options', () => {
    for (const id of ['student', 'private_employee', 'government', 'business_owner', 'freelancer', 'healthcare', 'teacher', 'engineer_tech', 'hospitality', 'between_jobs', 'other']) {
      assert.equal(validateOnboardingAnswer('occupation', id).valid, true, id);
    }
    assert.equal(validateOnboardingAnswer('occupation', 'invented').valid, false);
  });

  it('validates the match religion-preference question options', () => {
    for (const id of ['same_religion', 'same_faith_family', 'respect_mine', 'doesnt_matter']) {
      assert.equal(validateOnboardingAnswer('religion_preference', id).valid, true, id);
    }
    assert.equal(validateOnboardingAnswer('religion_preference', 'invented').valid, false);
  });

  it('requires religion and work answers for both genders', () => {
    for (const gender of ['male', 'female']) {
      const keys = getRequiredKeysForGender(gender);
      assert.ok(keys.includes('religion'), `${gender} missing religion`);
      assert.ok(keys.includes('occupation'), `${gender} missing occupation`);
      assert.ok(keys.includes('religion_preference'), `${gender} missing religion_preference`);

      const answers = completeAnswersFor(gender);
      delete answers.religion;
      assert.equal(isOnboardingComplete(answers), false, `${gender} without religion`);
    }
  });
});

describe('photo, bio, and quiz-feedback questions', () => {
  it('requires one to three uploaded photos', () => {
    assert.equal(validateOnboardingAnswer('photos', []).valid, false);
    assert.equal(validateOnboardingAnswer('photos', 'https://example.com/a.jpg').valid, false);
    assert.deepEqual(validateOnboardingAnswer('photos', ['https://example.com/a.jpg']), {
      valid: true,
      value: [{ url: 'https://example.com/a.jpg' }],
    });
    const three = validateOnboardingAnswer('photos', [
      { id: 7, url: 'https://example.com/a.jpg' },
      { url: 'https://example.com/b.jpg' },
      { url: 'data:image/jpeg;base64,/9j/4AAQ' },
    ]);
    assert.equal(three.valid, true);
    assert.equal(three.value.length, 3);
    assert.equal(three.value[0].id, 7);
    assert.equal(validateOnboardingAnswer('photos', [
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
      'https://example.com/c.jpg',
      'https://example.com/d.jpg',
    ]).valid, false);
    assert.equal(validateOnboardingAnswer('photos', ['not-a-url']).valid, false);
    assert.equal(validateOnboardingAnswer('photos', [{ url: '' }]).valid, false);
  });

  it('requires a short bio within the length limit', () => {
    assert.equal(validateOnboardingAnswer('bio', '').valid, false);
    assert.equal(validateOnboardingAnswer('bio', '  ').valid, false);
    assert.equal(validateOnboardingAnswer('bio', 'x').valid, false);
    assert.deepEqual(
      validateOnboardingAnswer('bio', '  I love coffee and jazz.  '),
      { valid: true, value: 'I love coffee and jazz.' },
    );
    assert.equal(validateOnboardingAnswer('bio', 'x'.repeat(501)).valid, false);
    assert.equal(validateOnboardingAnswer('bio', 'x'.repeat(500)).valid, true);
  });

  it('requires photos and bio for both genders', () => {
    for (const gender of ['male', 'female']) {
      const keys = getRequiredKeysForGender(gender);
      assert.ok(keys.includes('photos'), `${gender} missing photos`);
      assert.ok(keys.includes('bio'), `${gender} missing bio`);

      const answers = completeAnswersFor(gender);
      delete answers.photos;
      assert.equal(isOnboardingComplete(answers), false, `${gender} without photos`);
    }
  });
});

describe('gender-conditional results', () => {
  it('resolves search and email copy per gender', () => {
    const maleFlow = getResultsFlowForGender('male');
    const femaleFlow = getResultsFlowForGender('female');
    assert.match(maleFlow[1].heading, /women/);
    assert.match(femaleFlow[1].heading, /men/);
    assert.match(maleFlow[3].heading, /meet her/);
    assert.match(femaleFlow[3].heading, /meet him/);
    assert.equal(femaleFlow[1].testimonials[0].author, 'Hanna, 28');
  });

  it('labels the match pool with the gender the user is looking for', () => {
    const male = computeMatchResult({ gender: 'male', location: { name: 'Adama' } });
    const female = computeMatchResult({ gender: 'female', location: { name: 'Adama' } });
    assert.match(male.matchPoolLabel, /women in Adama/);
    assert.match(female.matchPoolLabel, /men in Adama/);
  });
});
