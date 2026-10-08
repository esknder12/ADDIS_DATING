import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VerificationCard from './VerificationCard.jsx';
import VerificationModal from './VerificationModal.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';

vi.mock('../../api/verification.api.js', () => ({
  fetchVerificationStatus: vi.fn(async () => ({
    success: true,
    isVerified: false,
    status: 'not_started',
    rejectionReason: null,
  })),
  requestVerification: vi.fn(async () => ({ success: true, status: 'requested' })),
}));

vi.mock('../../lib/telegram.js', () => ({
  closeMiniApp: vi.fn(),
  impact: vi.fn(),
  notify: vi.fn(),
}));

const { fetchVerificationStatus, requestVerification } = await import('../../api/verification.api.js');
const { closeMiniApp } = await import('../../lib/telegram.js');

const USER = { telegramId: '999', firstName: 'Abel', name: 'Abel', photoUrl: null, isDemo: false };

afterEach(() => {
  vi.clearAllMocks();
  fetchVerificationStatus.mockImplementation(async () => ({
    success: true,
    isVerified: false,
    status: 'not_started',
    rejectionReason: null,
  }));
});

describe('VerifiedBadge', () => {
  it('is announced as a verified marker and honours its size', () => {
    const { container } = render(<VerifiedBadge size={28} />);
    const badge = container.querySelector('.verified-badge');
    expect(badge.getAttribute('aria-label')).toBe('Verified');
    expect(badge.style.width).toBe('28px');
  });
});

describe('VerificationModal', () => {
  it('renders the copy from the product specification', () => {
    render(<VerificationModal userPhotoUrl={null} displayName="Abel" onClose={() => {}} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Get your verification badge' })).toBeTruthy();
    expect(
      screen.getByText(/Verification helps build a safer, more trusting community/),
    ).toBeTruthy();
    expect(screen.getByText('Video selfie')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Get verified' })).toBeTruthy();
  });

  it('requests verification and closes the Mini App on success', async () => {
    const onRequest = vi.fn(async () => {});
    render(<VerificationModal userPhotoUrl={null} displayName="Abel" onRequest={onRequest} onClose={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: 'Get verified' }));

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(closeMiniApp).toHaveBeenCalledTimes(1);
  });

  it('keeps the button usable and explains what went wrong on failure', async () => {
    const onRequest = vi.fn(async () => {
      const error = new Error('Telegram is unreachable');
      throw error;
    });
    render(<VerificationModal userPhotoUrl={null} displayName="Abel" onRequest={onRequest} onClose={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: 'Get verified' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Telegram is unreachable')).toBeTruthy();
    expect(closeMiniApp).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Get verified' }).disabled).toBe(false);
  });

  it('does not close the Mini App in demo mode', async () => {
    const onRequest = vi.fn(async () => {});
    render(
      <VerificationModal userPhotoUrl={null} displayName="Abel" isDemo onRequest={onRequest} onClose={() => {}} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Get verified' }));

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(closeMiniApp).not.toHaveBeenCalled();
    expect(screen.getByText(/Preview only/)).toBeTruthy();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<VerificationModal userPhotoUrl={null} displayName="Abel" onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the close icon', async () => {
    const onClose = vi.fn();
    render(<VerificationModal userPhotoUrl={null} displayName="Abel" onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('falls back to an initial when there is no photo', () => {
    const { container } = render(
      <VerificationModal userPhotoUrl={null} displayName="Abel" onClose={() => {}} />,
    );
    expect(container.querySelector('.verification-avatar__initials').textContent).toBe('A');
    expect(container.querySelector('.verification-avatar img')).toBeNull();
  });
});

describe('VerificationCard', () => {
  it('offers the CTA before verification starts', async () => {
    render(<VerificationCard user={USER} />);
    expect(await screen.findByRole('button', { name: 'Get verified' })).toBeTruthy();
    expect(screen.getByText('Get your verification badge')).toBeTruthy();
  });

  it('opens the modal from the card CTA', async () => {
    render(<VerificationCard user={USER} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Get verified' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('shows a reviewing state with no CTA while pending', async () => {
    fetchVerificationStatus.mockImplementation(async () => ({
      success: true,
      isVerified: false,
      status: 'pending_review',
      rejectionReason: null,
    }));

    render(<VerificationCard user={USER} />);
    expect(await screen.findByText('We’re reviewing your video')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Get verified' })).toBeNull();
    expect(screen.getByText('Checking for updates automatically.')).toBeTruthy();
  });

  it('shows the badge and no CTA once verified', async () => {
    fetchVerificationStatus.mockImplementation(async () => ({
      success: true,
      isVerified: true,
      status: 'approved',
      rejectionReason: null,
    }));

    const { container } = render(<VerificationCard user={USER} />);
    expect(await screen.findByText('You’re verified')).toBeTruthy();
    expect(container.querySelector('.verified-badge')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Get verified' })).toBeNull();
  });

  it('lets a rejected user try again and shows why', async () => {
    fetchVerificationStatus.mockImplementation(async () => ({
      success: true,
      isVerified: false,
      status: 'rejected',
      rejectionReason: 'your face is not clearly visible',
    }));

    render(<VerificationCard user={USER} />);
    expect(await screen.findByRole('button', { name: 'Get verified' })).toBeTruthy();
    expect(screen.getByText(/your face is not clearly visible/)).toBeTruthy();
  });
});
