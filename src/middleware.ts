// Blocks cross-site state-changing calls to /api/* (CSRF). Reads stay open; same-origin and
// non-browser requests pass. See docs/review/2026-11-04-security-fix-h1-m1-m2.md (M1).

import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/server/csrf";
import { secLog } from "@/server/debug";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function middleware(req: NextRequest) {
  if (SAFE_METHODS.has(req.method) || isSameOrigin(req.headers)) return NextResponse.next();
  secLog("cross-origin request blocked", {
    method: req.method,
    path: req.nextUrl.pathname,
    origin: req.headers.get("origin"),
    host: req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
  });
  return NextResponse.json({ error: "허용되지 않은 요청이에요" }, { status: 403 });
}

export const config = { matcher: "/api/:path*" };
