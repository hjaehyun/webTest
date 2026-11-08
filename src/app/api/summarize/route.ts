// POST /api/summarize  { entries: Entry[] } -> DaySummary
// Text AI step: the day's fragments become one scene description + tags.
// Signed-in users only, size-capped, and counted against the daily AI quota (H1).

import { NextResponse } from "next/server";

// A slow first model can take up to 60s before the fallback model answers (src/server/ai/gemini.ts).
export const maxDuration = 90;
import type { Entry } from "@/lib/types";
import { textAI } from "@/server/ai";
import { requireUser } from "@/server/auth";
import { entryWeathers } from "@/server/db/data";
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
    // Weather comes from the saved fragments (own rows, RLS), not from the client (specs/haru-weather.spl).
    const weathers = await entryWeathers(me.sb, me.user.id, entries.map((e) => e.id));
    const withWeather = entries.map((e) => ({ id: e.id, at: e.at, text: e.text, weather: weathers.get(e.id) ?? null }));
    return NextResponse.json(await textAI().summarizeDay(withWeather));
  } catch (err) {
    return fail(err);
  }
}
