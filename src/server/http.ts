// Small helpers shared by the API routes.

import { NextResponse } from "next/server";
import { NotConfiguredError } from "./ai";
import { secLog } from "./debug";

/** Thrown by server code for an expected failure the user should see (409 duplicate, 404, ...). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function unauthorized() {
  return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
}

/**
 * Turns thrown errors into JSON responses. Expected ones keep their status and message;
 * AI stubs answer 501 so the client can tell; anything else is logged and hidden behind `fallback`.
 */
export function fail(err: unknown, fallback = "AI 요청에 실패했습니다") {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof NotConfiguredError) {
    return NextResponse.json({ error: err.message }, { status: 501 });
  }
  console.error(err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export const DB_FAILED = "저장소에 연결하지 못했어요";

/**
 * Parses a JSON body, or null. Only `Content-Type: application/json` is accepted: an HTML form
 * can't send that type, so a cross-site form can't post JSON-looking text here (login CSRF, M1).
 */
export async function readJson(req: Request): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type.trim())) {
    secLog("non-JSON body rejected", { path: new URL(req.url).pathname, contentType: type || null });
    return null;
  }
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
