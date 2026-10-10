import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isOnboardingComplete,
  locationSuggestions,
  onboardingFlow,
  questionSteps,
  requiredQuestionKeys,
  totalQuestionCount,
  validateOnboardingAnswer,
} from '@dategram/shared/onboarding';

function firstValidAnswer(question) {
  if (question.input === 'single') return question.options[0].id;
  if (question.input === 'multi') {
    const options = question.options || question.groups.flatMap((group) => group.options);
    return [options[0].id];
  }
  if (question.input === 'number') return 26;
  if (question.input === 'location') return locationSuggestions[0];
  throw new Error(`Unsupported question type: ${question.input}`);
}

describe('onboarding configuration', () => {
  it('contains the complete five-section Phase 2 flow with stable unique keys', () => {
    assert.equal(totalQuestionCount, 31);
    assert.equal(questionSteps.length, 31);
    assert.equal(onboardingFlow.length, 43);
    assert.equal(new Set(onboardingFlow.map((step) => step.key)).size, onboardingFlow.length);
    assert.equal(new Set(requiredQuestionKeys).size, totalQuestionCount);
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
    const result = validateOnboardingAnswer('looking_for', [
      'serious_relationship',
      'serious_relationship',
    ]);
    assert.deepEqual(result, { valid: true, value: ['serious_relationship'] });
  });
});
