import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmailCaptureScreen from './EmailCaptureScreen.jsx';
import MatchPlanScreen from './MatchPlanScreen.jsx';
import MatchScoreCard from './MatchScoreCard.jsx';
import NameCaptureScreen from './NameCaptureScreen.jsx';
import ScoreGradientBar from './ScoreGradientBar.jsx';
import ScratchCard from './scratch/ScratchCard.jsx';
import ScratchCardContent from './scratch/ScratchCardContent.jsx';

const RESULTS = {
  score: 87,
  scoreTier: 'VERY_HIGH',
  yourType: 'Natural, 25–30',
  datingStyle: 'Connector',
  matchPoolCount: 57,
  matchPoolCity: 'Addis Ababa',
  responseRateMultiplier: 2.3,
  fourWeekGoalLabel: 'One great first date',
  email: null,
  name: 'Abel',
  photoUrl: null,
  promo: null,
};

beforeEach(() => {
  // jsdom has no 2D canvas without the optional `canvas` package; the scratch card must
  // degrade to its keyboard alternative rather than throw.
  if (!HTMLCanvasElement.prototype.getContext.name.includes('mock')) {
    HTMLCanvasElement.prototype.getContext = () => null;
  }
});

describe('MatchScoreCard', () => {
  it('shows the score, the derived stats and the initials fallback when there is no photo', () => {
    const { container } = render(
      <MatchScoreCard results={RESULTS} fallbackName="Abel" onContinue={() => {}} submitting={false} />,
    );

    expect(screen.getByText('You: 87')).toBeTruthy();
    expect(screen.getByText('Natural, 25–30')).toBeTruthy();
    expect(screen.getByText('Connector')).toBeTruthy();
    expect(screen.getByText(/Above average,\s*2\.3\s*×/)).toBeTruthy();
    expect(container.querySelector('.score-card__initials').textContent).toBe('A');
    expect(container.querySelector('.score-card__photo img')).toBeNull();
  });

  it('uses the profile photo when one exists', () => {
    const { container } = render(
      <MatchScoreCard
        results={{ ...RESULTS, photoUrl: 'https://cdn.example/me.jpg' }}
        fallbackName="Abel"
        onContinue={() => {}}
        submitting={false}
      />,
    );

    expect(container.querySelector('.score-card__photo img').getAttribute('src')).toBe('https://cdn.example/me.jpg');
  });

  it('positions the marker at the same percentage as the score it displays', () => {
    const { container } = render(<ScoreGradientBar score={87} />);
    const marker = container.querySelector('.score-scale__marker');
    expect(marker.style.left).toBe('87%');
  });

  it('clamps an out-of-range score so the marker stays on the track', () => {
    const { container } = render(<ScoreGradientBar score={140} />);
    expect(container.querySelector('.score-scale__marker').style.left).toBe('100%');
  });

  it('continues to the email step', async () => {
    const onContinue = vi.fn();
    render(<MatchScoreCard results={RESULTS} fallbackName="Abel" onContinue={onContinue} submitting={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe('EmailCaptureScreen', () => {
  it('keeps CONTINUE disabled until the email is valid, then submits it lowercased', async () => {
    const onSubmit = vi.fn();
    render(
      <EmailCaptureScreen initialEmail="" onSubmit={onSubmit} onSkip={() => {}} submitting={false} error="" />,
    );

    const continueButton = screen.getByRole('button', { name: 'CONTINUE' });
    expect(continueButton.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('Your email'), 'abel@');
    expect(continueButton.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('Your email'), 'example.com');
    expect(continueButton.disabled).toBe(false);

    await userEvent.click(continueButton);
    expect(onSubmit).toHaveBeenCalledWith('abel@example.com');
  });

  it('lets the user skip without a valid email', async () => {
    const onSkip = vi.fn();
    render(<EmailCaptureScreen initialEmail="" onSubmit={() => {}} onSkip={onSkip} submitting={false} error="" />);
    await userEvent.click(screen.getByRole('button', { name: 'SKIP THIS STEP' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('NameCaptureScreen', () => {
  it('blocks a name shorter than two characters and submits a trimmed value', async () => {
    const onSubmit = vi.fn();
    render(<NameCaptureScreen initialName="" onSubmit={onSubmit} submitting={false} error="" />);

    const continueButton = screen.getByRole('button', { name: 'CONTINUE' });
    expect(continueButton.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('Your name'), 'A');
    expect(continueButton.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('Your name'), 'bel  ');
    expect(continueButton.disabled).toBe(false);

    await userEvent.click(continueButton);
    expect(onSubmit).toHaveBeenCalledWith('Abel');
  });

  it('offers no skip action', () => {
    render(<NameCaptureScreen initialName="" onSubmit={() => {}} submitting={false} error="" />);
    expect(screen.queryByRole('button', { name: 'SKIP THIS STEP' })).toBeNull();
  });
});

describe('MatchPlanScreen', () => {
  it('uppercases the saved name in the heading', () => {
    render(<MatchPlanScreen results={RESULTS} fallbackName="Abel" onContinue={() => {}} submitting={false} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('ABEL');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('your 4-week Match Plan is ready');
  });

  it('quotes the user’s own four-week goal and carries the disclaimer', () => {
    render(<MatchPlanScreen results={RESULTS} fallbackName="Abel" onContinue={() => {}} submitting={false} />);
    expect(screen.getByText('Goal:', { exact: false }).textContent).toContain('One great first date');
    expect(screen.getByText('This chart is for illustrative purposes only.')).toBeTruthy();
    expect(screen.getByText('*Based on Premium users with a similar profile. Results vary.')).toBeTruthy();
  });
});

describe('ScratchCard', () => {
  it('hides the prize and offers a keyboard reveal until scratched', () => {
    render(
      <ScratchCard onRevealComplete={() => {}}>
        <ScratchCardContent discountPercent={50} promoCode="DATEGRAM-7QK2MX" />
      </ScratchCard>,
    );

    expect(screen.getByRole('button', { name: 'Reveal my discount' })).toBeTruthy();
    expect(screen.getByText('Scratch it off')).toBeTruthy();
  });

  it('reveals the discount and fires the completion callback through the accessible path', async () => {
    const onRevealComplete = vi.fn();
    render(
      <ScratchCard onRevealComplete={onRevealComplete}>
        <ScratchCardContent discountPercent={50} promoCode="DATEGRAM-7QK2MX" expiresAt="2026-10-15T09:00:00.000Z" />
      </ScratchCard>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reveal my discount' }));

    expect(onRevealComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText('DATEGRAM-7QK2MX')).toBeTruthy();
    expect(screen.getByText('Applied automatically at checkout · valid until Oct 15')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reveal my discount' })).toBeNull();
  });
});
