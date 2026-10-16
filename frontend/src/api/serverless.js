// Client for Telegram Serverless endpoints (tgcloud/endpoints/*).
//
// The Mini App calls bot-side functions via the official bridge:
//   Telegram.WebApp.Serverless.call('<name>', input, (err, result) => …)
// Telegram attaches + verifies initData, so endpoints know the caller with no
// extra auth code. This module wraps that callback API in promises with a
// timeout, and degrades gracefully wherever the bridge is missing
// (old clients, desktop, plain browsers).

const DEFAULT_TIMEOUT_MS = 12_000;

function getServerlessBridge() {
  try {
    const candidates = [
      // Official global injected by telegram-web-app.js (preferred — the
      // Serverless API is newer than most SDK wrappers).
      typeof window !== 'undefined' ? window.Telegram?.WebApp?.Serverless : null,
    ];
    for (const bridge of candidates) {
      if (bridge && typeof bridge.call === 'function') return bridge;
    }
    return null;
  } catch {
    return null;
  }
}

export function isServerlessBridgeAvailable() {
  if (import.meta.env.VITE_SERVERLESS_ENABLED === 'false') return false;
  return getServerlessBridge() != null;
}

/**
 * Call a Serverless endpoint by name.
 * @returns {Promise<any>} the endpoint's `result` object.
 * @throws {{message: string, type: string|null, parameters: object|null}}
 *   err.message = endpoint description (or transport detail),
 *   err.type = 'ENDPOINT_ERROR' for thrown EndpointErrors, else platform type.
 */
export function callServerlessEndpoint(name, input = {}, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const bridge = getServerlessBridge();
    if (!bridge) {
      reject({
        message: 'Serverless bridge is not available in this client',
        type: 'BRIDGE_UNAVAILABLE',
        parameters: null,
      });
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject({
        message: `Serverless endpoint "${name}" timed out after ${timeoutMs}ms`,
        type: 'TIMEOUT',
        parameters: null,
      });
    }, timeoutMs);
    try {
      bridge.call(name, input || {}, (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          reject({
            message: error?.message || `Serverless endpoint "${name}" failed`,
            type: error?.type || null,
            parameters: error?.parameters || null,
          });
        } else {
          resolve(result);
        }
      });
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject({
        message: error?.message || `Serverless endpoint "${name}" failed`,
        type: 'BRIDGE_ERROR',
        parameters: null,
      });
    }
  });
}

/**
 * Bot-side status for the current user (tgcloud/endpoints/botStatus.js).
 * @returns {Promise<{found:boolean,verificationStatus:string,isVerified:boolean,isVip:boolean,notificationsEnabled:boolean}>}
 */
export async function getServerlessBotStatus() {
  return callServerlessEndpoint('botStatus', {});
}
