// POST /api/summarize  { entries: Entry[] } -> DaySummary
// Text AI step: the day's fragments become one scene description + tags.
// Signed-in users only, size-capped, and counted against the daily AI quota (H1).

import { NextResponse } from "next/server";
import type { Entry } from "@/lib/types";
import { textAI } from "@/server/ai";
import { requireUser } from "@/server/auth";
import { consumeAiQuota } from "@/server/db/quota";
import { bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { AI_LIMITS, isText } from "@/server/validate";

const isEntry = (v: unknown): v is Entry =>
  isObj(v) && isText(v.id, 64) && isText(v.at, 40) && isText(v.text, AI_LIMITS.entryText);

export async function POST(req: Request) {
  const body = await readJson(req);
  const entries = isObj(body) ? body.entries : null;
  if (
    !Array.isArray(entries) ||
    entries.length === 0 ||
    entries.length > AI_LIMITS.entries ||
    !entries.every(isEntry)
  ) {
    return bad(`entries: 1~${AI_LIMITS.entries}개의 Entry(text 1~${AI_LIMITS.entryText}자) 배열이 필요합니다`);
  }

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    await consumeAiQuota(me.sb, me.user.id, "summarize");
    return NextResponse.json(await textAI().summarizeDay(entries));
  } catch (err) {
    return fail(err);
  }
}
