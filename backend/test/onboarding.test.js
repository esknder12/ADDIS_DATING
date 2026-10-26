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
} from '@libmatch/shared/onboarding';
import {
  computeMatchResult,
  getResultsFlowForGender,
} from '@libmatch/shared/results';

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
    assert.equal(totalQuestionCount, 17);
    assert.equal(questionSteps.length, 17);
    assert.equal(onboardingFlow.length, 18);
    assert.equal(onboardingStepByKey.has('ten-minutes'), false);
    for (const removedStep of ['home_atmosphere', 'activity_level_preference', 'kids_preference']) {
      assert.equal(onboardingStepByKey.has(removedStep), false, removedStep);
    }
    assert.equal(new Set(onboardingFlow.map((step) => step.key)).size, onboardingFlow.length);
    assert.equal(new Set(requiredQuestionKeys).size, totalQuestionCount);
  });

  it('gives every gender a 17-question journey', () => {
    assert.equal(getQuestionCountForGender('male'), 17);
    assert.equal(getQuestionCountForGender('female'), 17);
    assert.equal(getRequiredKeysForGender('male').length, 17);
    assert.equal(getRequiredKeysForGender('female').length, 17);
    assert.equal(
      getVisibleSteps('male').filter((step) => step.kind === 'question').length,
      17,
    );
    assert.equal(
      getVisibleSteps('female').filter((step) => step.kind === 'question').length,
      17,
    );
  });

  it('places the religion question before other priorities', () => {
    const religionIndex = onboardingFlow.findIndex((step) => step.key === 'religion');
    const prioritiesIndex = onboardingFlow.findIndex((step) => step.key === 'what_matters');
    assert.ok(religionIndex >= 0 && religionIndex < prioritiesIndex);
  });

  it('asks whether a match should share the user’s religion immediately after their religion', () => {
    const religionIndex = onboardingFlow.findIndex((step) => step.key === 'religion');
    const preferenceIndex = onboardingFlow.findIndex((step) => step.key === 'religion_preference');
    assert.ok(religionIndex >= 0);
    assert.equal(preferenceIndex, religionIndex + 1);
    assert.equal(onboardingStepByKey.get('religion_preference').section, 'about-you');
  });

  it('asks for location immediately before distance preference', () => {
    const locationIndex = onboardingFlow.findIndex((step) => step.key === 'location');
    const distanceIndex = onboardingFlow.findIndex((step) => step.key === 'distance_preference');
    assert.ok(locationIndex >= 0);
    assert.equal(distanceIndex, locationIndex + 1);
  });

  it('includes the multi-select dating intention question', () => {
    const question = onboardingStepByKey.get('looking_for');
    assert.equal(question.title, 'What are you looking for right now?');
    assert.equal(question.subtitle, 'Choose all that apply');
    assert.equal(question.input, 'multi');
    assert.deepEqual(
      question.options.map(({ id, label }) => [id, label]),
      [
        ['serious_relationship', 'Serious relationship'],
        ['dating_and_seeing', 'Dating & seeing where it goes'],
        ['online_communication', 'Online communication'],
        ['not_sure', 'Not sure yet'],
      ],
    );
    assert.equal(validateOnboardingAnswer('looking_for', ['serious_relationship', 'not_sure']).valid, true);
    assert.equal(validateOnboardingAnswer('looking_for', ['invented']).valid, false);
  });

  it('uses a dedicated photo for each female body-type option', () => {
    const options = onboardingStepByKey.get('body_type_preference').options;
    assert.deepEqual(
      options.map(({ id, image }) => [id, image]),
      [
        ['slim', '/images/body-type-slim.png?v=2'],
        ['athletic', '/images/body-type-athletic.png?v=2'],
        ['curvy', '/images/body-type-curvy.png?v=2'],
        ['average', '/images/body-type-average.png?v=2'],
      ],
    );
  });

  it('shows male body-type options to female users and accepts Stocky', () => {
    const question = onboardingStepByKey.get('body_type_preference');
    const maleOptions = resolveOnboardingStep(question, 'female').options;
    assert.deepEqual(
      maleOptions.map(({ id, image }) => [id, image]),
      [
        ['slim', '/images/body-type-men-slim.png?v=2'],
        ['athletic', '/images/body-type-men-athletic.png?v=2'],
        ['stocky', '/images/body-type-men-stocky.png?v=2'],
        ['average', '/images/body-type-men-average.png?v=2'],
      ],
    );
    assert.equal(validateOnboardingAnswer('body_type_preference', ['stocky']).valid, true);
  });

  it('adds a private, gender-specific self-build question after body-type preference', () => {
    const preferenceIndex = onboardingFlow.findIndex((step) => step.key === 'body_type_preference');
    const buildIndex = onboardingFlow.findIndex((step) => step.key === 'body_build');
    const question = onboardingStepByKey.get('body_build');
    assert.equal(buildIndex, preferenceIndex + 1);
    assert.equal(question.title, 'How would you describe your build?');
    assert.equal(question.input, 'single');
    assert.equal(question.layout, 'image-grid');
    assert.deepEqual(
      question.options.slice(0, 4).map(({ id, image }) => [id, image]),
      [
        ['slim', '/images/body-type-men-slim.png?v=2'],
        ['athletic', '/images/body-type-men-athletic.png?v=2'],
        ['stocky', '/images/body-type-men-stocky.png?v=2'],
        ['average', '/images/body-type-men-average.png?v=2'],
      ],
    );
    assert.equal(question.options.at(-1).id, 'prefer_not_say');

    const femaleOptions = resolveOnboardingStep(question, 'female').options;
    assert.deepEqual(
      femaleOptions.slice(0, 4).map(({ id, image }) => [id, image]),
      [
        ['slim', '/images/body-type-slim.png?v=2'],
        ['athletic', '/images/body-type-athletic.png?v=2'],
        ['curvy', '/images/body-type-curvy.png?v=2'],
        ['average', '/images/body-type-average.png?v=2'],
      ],
    );
    assert.equal(femaleOptions.at(-1).id, 'prefer_not_say');
    assert.equal(validateOnboardingAnswer('body_build', 'prefer_not_say').valid, true);
    assert.equal(validateOnboardingAnswer('body_build', ['slim']).valid, false);
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
    assert.equal(isStepVisibleForAnswers(onboardingStepByKey.get('religion'), no), true);
  });

  it('combines the gender and answer gates', () => {
    const yes = { gender: 'male', what_matters: ['building_family'] };
    assert.equal(isStepVisible(conditionalStep, 'male', yes), true);
    assert.equal(isStepVisible(conditionalStep, 'female', yes), false);
    const maleOnlyStep = { key: 'male_only', kind: 'question', showFor: ['male'] };
    assert.equal(isStepVisible(maleOnlyStep, 'male', yes), true);
    assert.equal(isStepVisible(maleOnlyStep, 'female', yes), false);
  });

  it('keeps regular questions unconditional and required on every journey', () => {
    const missing = completeAnswersFor('male');
    delete missing.occupation;
    assert.ok(getRequiredKeysForAnswers(missing).includes('occupation'));
    assert.equal(isOnboardingComplete(missing), false);

    // Progress metadata is identical with or without answers while no step is
    // answer-conditional.
    const work = onboardingStepByKey.get('occupation');
    assert.equal(
      resolveOnboardingStep(work, 'male').sectionQuestionCount,
      resolveOnboardingStep(work, 'male', missing).sectionQuestionCount,
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
    for (const id of ['student', 'private_employee', 'business_owner', 'freelancer', 'between_jobs']) {
      assert.equal(validateOnboardingAnswer('occupation', id).valid, true, id);
    }
    for (const id of ['government', 'healthcare', 'teacher', 'engineer_tech', 'hospitality', 'other', 'invented']) {
      assert.equal(validateOnboardingAnswer('occupation', id).valid, false, id);
    }
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
