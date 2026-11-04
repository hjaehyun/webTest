// Debug logs for checking features by hand: rejected requests (CSRF, non-JSON body, AI quota),
// picture redraws, ...
// On in development; in production only with DEBUG_SECURITY=1 (Vercel env), so logs stay quiet by default.
// Never log request bodies, passwords or cookies here.

const ON = process.env.NODE_ENV !== "production" || process.env.DEBUG_SECURITY === "1";

/** `[scope] event {detail}` on the server console, when debug logs are on. */
export function debugLog(scope: string, event: string, detail: Record<string, unknown> = {}): void {
  if (ON) console.warn(`[${scope}] ${event}`, detail);
}

export function secLog(event: string, detail: Record<string, unknown> = {}): void {
  debugLog("security", event, detail);
}
