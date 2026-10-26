// Single choke point for error logging: pg/driver errors can embed query text,
// constraint detail, or connection config in their extra fields, so only the
// message + stack ever reach Render logs.
export function logError(prefix, error) {
  const message = error?.message || String(error);
  if (error && typeof error.stack === 'string') {
    console.error(`${prefix} ${message}\n${error.stack}`);
    return;
  }
  console.error(`${prefix} ${message}`);
}
