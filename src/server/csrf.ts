// Same-origin check for state-changing requests (CSRF defence, used by src/middleware.ts).
// Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE, so a mismatch means another site
// made the request. No Origin at all means a non-browser client (curl, server), which CSRF cannot use.

export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true;
  if (origin === "null") return false; // sandboxed iframe, file://, some redirects
  // Behind Vercel's proxy the public host is in x-forwarded-host; it may list several, first is the client's.
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
