import { createContext, useContext, useMemo } from 'react';

const OnboardingResultsContext = createContext(null);

export function OnboardingResultsProvider({ value, children }) {
  const memoised = useMemo(() => value, [value]);
  return <OnboardingResultsContext.Provider value={memoised}>{children}</OnboardingResultsContext.Provider>;
}

export function useOnboardingResults() {
  const context = useContext(OnboardingResultsContext);
  if (!context) {
    throw new Error('useOnboardingResults must be used inside OnboardingResultsProvider');
  }
  return context;
}

export default OnboardingResultsContext;
