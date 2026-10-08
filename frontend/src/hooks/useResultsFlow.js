import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createResultsApiStore, createResultsLocalStore } from '../lib/resultsStores.js';

export const RESULTS_STEPS = ['analyzing', 'score', 'email', 'name', 'plan', 'discount'];
const HASH_PREFIX = '#r/';

function errorMessage(error) {
  return error.response?.data?.error?.message
    || error.message
    || 'We could not load your results. Please try again.';
}

function stepFromHash() {
  const raw = window.location.hash;
  if (!raw.startsWith(HASH_PREFIX)) return null;
  const step = raw.slice(HASH_PREFIX.length);
  return RESULTS_STEPS.includes(step) ? step : null;
}

/** Where a returning user should land, so a killed app never replays finished steps. */
export function resolveEntryStep(results) {
  if (!results || results.score === null || results.score === undefined) return 'analyzing';
  if (results.resultsCompleted) return results.promo ? 'plan' : 'discount';
  if (results.resultsViewedAt) return results.promo ? 'plan' : 'discount';
  if (!results.name) return results.email === null ? 'score' : 'name';
  return 'plan';
}

export function useResultsFlow({ user, readAnswers, onFinished }) {
  const store = useMemo(
    () => (user.isDemo
      ? createResultsLocalStore({ user, readAnswers })
      : createResultsApiStore()),
    [readAnswers, user],
  );

  const [status, setStatus] = useState('loading');
  const [results, setResults] = useState(null);
  const [step, setStep] = useState(RESULTS_STEPS[0]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const resultsRef = useRef(null);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const goTo = useCallback((nextStep) => {
    if (!RESULTS_STEPS.includes(nextStep)) return;
    setStep(nextStep);
    window.history.replaceState(null, '', `${HASH_PREFIX}${nextStep}`);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus('loading');
      setError('');
      try {
        const loaded = await store.load();
        if (cancelled) return;

        resultsRef.current = loaded.results;
        setResults(loaded.results);

        const fromHash = stepFromHash();
        const entry = resolveEntryStep(loaded.results);
        // Honour a deep link only when the state actually supports it.
        const isForwardJump = RESULTS_STEPS.indexOf(fromHash || '') > RESULTS_STEPS.indexOf(entry);
        goTo(fromHash && !isForwardJump ? fromHash : entry);
        setStatus('ready');
      } catch (loadError) {
        if (cancelled) return;
        setError(errorMessage(loadError));
        setStatus('error');
      }
    }

    load();
    return () => { cancelled = true; };
  }, [goTo, store]);

  // Hardware/browser back inside the Telegram webview should move one step back, not exit.
  useEffect(() => {
    function onPopState() {
      const fromHash = stepFromHash();
      if (fromHash) setStep(fromHash);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const run = useCallback(async (action) => {
    setSubmitting(true);
    setError('');
    try {
      return await action();
    } catch (actionError) {
      setError(errorMessage(actionError));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const begin = useCallback(() => run(async () => {
    const calculated = await store.calculate();
    resultsRef.current = calculated.results;
    setResults(calculated.results);
    goTo('score');
  }), [goTo, run, store]);

  const saveEmail = useCallback((email) => run(async () => {
    const updated = await store.setEmail(email);
    resultsRef.current = updated.results;
    setResults(updated.results);
    goTo('name');
  }), [goTo, run, store]);

  const saveName = useCallback((name) => run(async () => {
    const updated = await store.setName(name);
    resultsRef.current = updated.results;
    setResults(updated.results);
    goTo('plan');
  }), [goTo, run, store]);

  const fetchPromo = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      const promo = await store.getPromo();
      setResults((current) => (current ? { ...current, promo } : current));
      return promo;
    } catch (promoError) {
      setError(errorMessage(promoError));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [store]);

  const finish = useCallback(() => run(async () => {
    const finishedUser = await store.complete();
    setResults((current) => (current ? { ...current, resultsCompleted: true } : current));
    if (onFinished) onFinished(finishedUser);
    return finishedUser;
  }), [onFinished, run, store]);

  const retry = useCallback(() => {
    setStatus('loading');
    window.location.reload();
  }, []);

  return {
    status,
    error,
    results,
    step,
    submitting,
    goTo,
    begin,
    saveEmail,
    saveName,
    fetchPromo,
    finish,
    retry,
  };
}
