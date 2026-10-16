// Node module hook: resolves the tgcloud `sdk` imports to local shims so the
// REAL tgcloud/ modules run on a laptop with plain `node` (no Telegram).
// Used only by smoke.mjs. Never deployed (lives outside tgcloud/).
export async function resolve(specifier, context, nextResolve) {
  if (
    specifier === 'sdk'
    || specifier === 'sdk/db'
    || specifier === 'sdk/api'
    || specifier === 'sdk/fetch'
  ) {
    const file = specifier === 'sdk/db' ? './sdk-db-shim.mjs' : './sdk-shim.mjs';
    return { url: new URL(file, import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier);
}
