import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchVerificationStatus } from '../api/verification.api.js';

export const VERIFICATION_POLL_STATES = ['requested', 'pending_review'];
const DEMO_KEY_PREFIX = 'dategram:verification:v1:';

const INITIAL_STATE = {
  isVerified: false,
  status: 'not_started',
  rejectionReason: null,
  loading: true,
  error: '',
};

function errorMessage(error) {
  return error.response?.data?.error?.message
    || error.message
    || 'We could not check your verification status.';
}

function readDemoStatus(telegramId) {
  try {
    const cached = window.localStorage.getItem(`${DEMO_KEY_PREFIX}${telegramId}`);
    if (!cached) return { isVerified: false, status: 'not_started', rejectionReason: null };
    const parsed = JSON.parse(cached);
    return {
      isVerified: Boolean(parsed.isVerified),
      status: parsed.status || 'not_started',
      rejectionReason: parsed.rejectionReason || null,
    };
  } catch {
    return { isVerified: false, status: 'not_started', rejectionReason: null };
  }
}

export function writeDemoStatus(telegramId, status) {
  window.localStorage.setItem(`${DEMO_KEY_PREFIX}${telegramId}`, JSON.stringify(status));
}

/**
 * Polls verification state so the badge appears without a manual refresh.
 *
 * The interval reads current state from a ref rather than from inside a state updater: a
 * updater must be pure, and StrictMode invokes it twice, which would double every request.
 * Polling only happens in the two states that can still change, and pauses while the tab is
 * hidden.
 */
export function useVerificationStatus({ isDemo = false, telegramId = '', pollInterval = 5000 } = {}) {
  const [state, setState] = useState(INITIAL_STATE);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const checkStatus = useCallback(async () => {
    try {
      const data = isDemo ? readDemoStatus(telegramId) : await fetchVerificationStatus();
      const next = {
        isVerified: Boolean(data.isVerified),
        status: data.status || 'not_started',
        rejectionReason: data.rejectionReason ?? null,
        loading: false,
        error: '',
      };
      stateRef.current = next;
      setState(next);
      return next;
    } catch (error) {
      const next = { ...stateRef.current, loading: false, error: errorMessage(error) };
      stateRef.current = next;
      setState(next);
      return null;
    }
  }, [isDemo, telegramId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = stateRef.current;
      if (current.loading) return;
      if (!VERIFICATION_POLL_STATES.includes(current.status)) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      checkStatus();
    }, pollInterval);

    return () => window.clearInterval(timer);
  }, [checkStatus, pollInterval]);

  return { ...state, refetch: checkStatus };
}
