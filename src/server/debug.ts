// Security debug log for rejected requests (CSRF, non-JSON body, AI quota).
// On in development; in production only with DEBUG_SECURITY=1 (Vercel env), so logs stay quiet by default.
// Never log request bodies, passwords or cookies here.

const ON = process.env.NODE_ENV !== "production" || process.env.DEBUG_SECURITY === "1";

export function secLog(event: string, detail: Record<string, unknown> = {}): void {
  if (ON) console.warn(`[security] ${event}`, detail);
}
