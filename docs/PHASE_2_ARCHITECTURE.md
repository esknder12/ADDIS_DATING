# Phase 2 Architecture

## Shared flow contract

`shared/src/onboarding.js` is the source of truth for both browser rendering and server validation. It contains:

- 33 ordered steps
- 29 configured questions (28 required per gender journey: `showFor` gates gender-exclusive steps; `showIf` can gate answer-conditional steps)
- 4 interstitial screens (`ten-minutes`, `we-got-you`, `algorithm-work`, `success-stories`)
- gender-conditional (`variants` / `labelByGender`) copy resolved via `resolveOnboardingStep`
- answer-conditional (`showIf`) visibility resolved via `isStepVisible` — navigation, progress totals, and completion (`getRequiredKeysForAnswers`) all honour the same gate
- religion, occupation (work), and religion-preference questions
- photo upload (`photos`), free-text bio (`text`), and quiz-feedback questions
- five section definitions and progress metadata
- stable answer keys and option IDs
- supported cities
- type-specific validation

The API never trusts option labels or client-side validation. It imports the same stable IDs and validates every submitted value again.

## Data model

### `onboarding_answers`

One JSONB value per `(user_id, question_key)`. JSONB allows scalar answers, arrays, numbers, and the normalized location object without encoding everything as strings.

### `onboarding_progress`

One row per user containing the current step key/index and completion state. Keeping both key and index makes resume efficient while route validation ensures they always correspond to the same configured step.

Core profile fields (`gender`, `age`, `city`, `country`) are synchronized transactionally when their onboarding answer changes.

## Save behavior

- Single select: selected state is shown for 260 ms, then answer and next progress are saved together.
- Multi select: local draft changes until **NEXT STEP**.
- Interstitial/back navigation: progress-only save.
- Final question: save answer, validate the full required set, then atomically mark onboarding complete.
- Browser preview: equivalent state is stored under a versioned LocalStorage key and never sent to protected APIs.

## UI composition

- `OnboardingFlow` controls loading, error, active, and completion states.
- `QuestionScreen` renders input layouts from config.
- `InterstitialScreen` renders value-proposition visual variants.
- `OptionControls` provides consistent selected/check states.
- `useOnboarding` owns resume, persistence, navigation, and errors.

All screens share the same fixed mobile shell, safe-area-aware top bar, independent scrolling content, and sticky CTA area.

## Validation invariants

- Every question is required.
- Multi-select values must be unique configured IDs.
- “None” cannot coexist with another choice.
- Age must be an integer from 18 to 100.
- Location must match a server-known location ID.
- Progress key and numeric index must point to the same flow step.
- All endpoints derive user identity exclusively from validated Telegram `initData`.
