// POST /api/summarize  { entries: Entry[] } -> DaySummary
// Text AI step: the day's fragments become one scene description + tags.

import { NextResponse } from "next/server";
import type { Entry } from "@/lib/types";
import { textAI } from "@/server/ai";
import { bad, fail, isObj, readJson } from "@/server/http";

const isEntry = (v: unknown): v is Entry =>
  isObj(v) && typeof v.id === "string" && typeof v.at === "string" && typeof v.text === "string";

export async function POST(req: Request) {
  const body = await readJson(req);
  const entries = isObj(body) ? body.entries : null;
  if (!Array.isArray(entries) || entries.length === 0 || !entries.every(isEntry)) {
    return bad("entries: 비어 있지 않은 Entry 배열이 필요합니다");
  }

  try {
    return NextResponse.json(await textAI().summarizeDay(entries));
  } catch (err) {
    return fail(err);
  }
}
