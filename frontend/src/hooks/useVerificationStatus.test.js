import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVerificationStatus } from './useVerificationStatus.js';

vi.mock('../api/verification.api.js', () => ({
  fetchVerificationStatus: vi.fn(),
}));

const { fetchVerificationStatus } = await import('../api/verification.api.js');

function payload(overrides = {}) {
  return { success: true, isVerified: false, status: 'not_started', rejectionReason: null, ...overrides };
}

/**
 * `waitFor` polls with real timers, so it deadlocks under fake timers. Flushing the microtask
 * queue inside act() settles the mocked promise chain deterministically instead.
 */
async function flush(rounds = 4) {
  for (let index = 0; index < rounds; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useVerificationStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchVerificationStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the initial status once', async () => {
    fetchVerificationStatus.mockResolvedValue(payload({ status: 'pending_review' }));
    const { result } = renderHook(() => useVerificationStatus({ pollInterval: 1000 }));

    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.status).toBe('pending_review');
    expect(fetchVerificationStatus).toHaveBeenCalledTimes(1);
  });

  it('polls while pending and stops once the state is terminal', async () => {
    fetchVerificationStatus.mockResolvedValue(payload({ status: 'pending_review' }));
    const { result } = renderHook(() => useVerificationStatus({ pollInterval: 1000 }));
    await flush();

    await advance(3000);
    expect(fetchVerificationStatus).toHaveBeenCalledTimes(4, '1 initial + 3 ticks');

    fetchVerificationStatus.mockResolvedValue(payload({ isVerified: true, status: 'approved' }));
    await advance(1000);
    expect(result.current.isVerified).toBe(true);

    const callsAfterApproval = fetchVerificationStatus.mock.calls.length;
    await advance(5000);
    expect(fetchVerificationStatus).toHaveBeenCalledTimes(callsAfterApproval, 'terminal state stops polling');
  });

  it('does not poll when verification was never started', async () => {
    fetchVerificationStatus.mockResolvedValue(payload({ status: 'not_started' }));
    renderHook(() => useVerificationStatus({ pollInterval: 1000 }));
    await flush();
    expect(fetchVerificationStatus).toHaveBeenCalledTimes(1);

    await advance(5000);
    expect(fetchVerificationStatus).toHaveBeenCalledTimes(1);
  });

  it('pauses polling while the tab is hidden', async () => {
    fetchVerificationStatus.mockResolvedValue(payload({ status: 'requested' }));
    renderHook(() => useVerificationStatus({ pollInterval: 1000 }));
    await flush();
    expect(fetchVerificationStatus).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    await advance(4000);
    expect(fetchVerificationStatus).toHaveBeenCalledTimes(1, 'hidden tab must not poll');

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    await advance(1000);
    expect(fetchVerificationStatus).toHaveBeenCalledTimes(2);
  });

  it('surfaces an API error without stopping the hook', async () => {
    fetchVerificationStatus.mockRejectedValue({ response: { data: { error: { message: 'Rate limited' } } } });
    const { result } = renderHook(() => useVerificationStatus({ pollInterval: 1000 }));

    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Rate limited');
  });

  it('reads demo state from LocalStorage instead of calling the API', async () => {
    window.localStorage.setItem(
      'dategram:verification:v1:demo-user',
      JSON.stringify({ isVerified: true, status: 'approved' }),
    );

    const { result } = renderHook(() => useVerificationStatus({ isDemo: true, telegramId: 'demo-user' }));
    await flush();

    expect(result.current.isVerified).toBe(true);
    expect(result.current.status).toBe('approved');
    expect(fetchVerificationStatus).not.toHaveBeenCalled();
    window.localStorage.clear();
  });

  it('refetches on demand', async () => {
    fetchVerificationStatus.mockResolvedValue(payload());
    const { result } = renderHook(() => useVerificationStatus({ pollInterval: 1000 }));
    await flush();

    fetchVerificationStatus.mockResolvedValue(payload({ status: 'pending_review' }));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.status).toBe('pending_review');
  });
});
