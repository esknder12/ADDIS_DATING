import { getSection } from '@dategram/shared/onboarding';

export default function QuestionHeader({ step }) {
  const section = getSection(step.section);

  return (
    <div className={`question-header ${step.showProgress === false ? 'question-header--no-progress' : ''}`}>
      {step.showProgress !== false && (
        <div className="section-progress" aria-label={`${section.label}, question ${step.sectionQuestionIndex} of ${step.sectionQuestionCount}`}>
          <span className="section-progress__label" style={{ '--section-accent': section.accent }}>
            {section.label}
          </span>
          <div className="section-progress__segments" aria-hidden="true">
            {Array.from({ length: step.sectionQuestionCount }, (_, index) => (
              <span
                key={index}
                className={index < step.sectionQuestionIndex ? 'is-filled' : ''}
              />
            ))}
          </div>
        </div>
      )}
      <h1>{step.title}</h1>
      {step.subtitle && <p>{step.subtitle}</p>}
    </div>
  );
}
