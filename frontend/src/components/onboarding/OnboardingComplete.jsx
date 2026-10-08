import { totalQuestionCount } from '@dategram/shared/onboarding';
import BrandMark from '../BrandMark.jsx';

export default function OnboardingComplete({ firstName }) {
  return (
    <main className="onboarding-complete">
      <div className="completion-orbit" aria-hidden="true">
        <span className="completion-orbit__ring completion-orbit__ring--one" />
        <span className="completion-orbit__ring completion-orbit__ring--two" />
        <BrandMark size={82} />
        <span className="completion-check">✓</span>
      </div>
      <p className="completion-eyebrow">PROFILE FOUNDATION COMPLETE</p>
      <h1>{firstName ? `${firstName}, your answers are in.` : 'Your answers are in.'}</h1>
      <p className="completion-copy">We have everything needed to build your personalized dating profile and calculate your match potential.</p>
      <div className="completion-stats">
        <div><strong>{totalQuestionCount}</strong><span>answers</span></div>
        <div><strong>5</strong><span>sections</span></div>
        <div><strong>✓</strong><span>saved</span></div>
      </div>
      <div className="completion-next">
        <span>✦</span>
        <div><strong>Match analysis is next</strong><p>Your personalized results flow begins in Phase 3.</p></div>
      </div>
    </main>
  );
}
