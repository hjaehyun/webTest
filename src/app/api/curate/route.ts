// POST /api/curate  CurationInput -> CurationText
// Curator: writes a headline + commentary from counted tags and saved scene summaries.

import { NextResponse } from "next/server";
import type { CurationInput } from "@/lib/types";
import { textAI } from "@/server/ai";
import { bad, fail, isObj, readJson } from "@/server/http";

const isInput = (v: unknown): v is CurationInput =>
  isObj(v) &&
  typeof v.periodLabel === "string" &&
  typeof v.count === "number" &&
  Array.isArray(v.top) &&
  v.top.every((t) => isObj(t) && typeof t.tag === "string" && typeof t.count === "number") &&
  Array.isArray(v.summaries) &&
  v.summaries.every((s) => typeof s === "string");

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!isInput(body)) return bad("periodLabel, count, top[], summaries[]가 필요합니다");

  try {
    return NextResponse.json(await textAI().writeCuration(body));
  } catch (err) {
    return fail(err);
  }
}
