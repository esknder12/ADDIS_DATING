import { useCallback, useEffect, useState } from 'react';
import { getServerlessBotStatus, isServerlessBridgeAvailable } from '../api/serverless.js';
import { isTelegramMiniApp } from '../lib/telegram.js';

// Fetches bot-side state from Telegram Serverless (verification, VIP).
// States:
//   idle         — not started (not in Telegram, or bridge missing)
//   loading      — request in flight
//   ready        — data received (`data` is set)
//   unavailable  — bridge missing/disabled (old client, browser)
//   error        — call failed (`error.message`, retryable via `retry`)
export default function useBotStatus() {
  const [state, setState] = useState('idle');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isTelegramMiniApp()) {
      setState('idle');
      return;
    }
    if (!isServerlessBridgeAvailable()) {
      setState('unavailable');
      return;
    }
    setState('loading');
    setError(null);
    try {
      const status = await getServerlessBotStatus();
      setData(status);
      setState('ready');
    } catch (fetchError) {
      setError({
        message: fetchError?.message || 'Bot link failed',
        type: fetchError?.type || null,
      });
      setState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    state, data, error, retry: load, inTelegram: isTelegramMiniApp(),
  };
}
