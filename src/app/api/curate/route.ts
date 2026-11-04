// POST /api/curate  CurationInput -> CurationText
// Curator: writes a headline + commentary from counted tags and saved scene summaries.
// Signed-in users only, size-capped, and counted against the daily AI quota (H1).

import { NextResponse } from "next/server";
import type { CurationInput } from "@/lib/types";
import { textAI } from "@/server/ai";
import { requireUser } from "@/server/auth";
import { consumeAiQuota } from "@/server/db/quota";
import { bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { AI_LIMITS, isInt, isText } from "@/server/validate";

const isInput = (v: unknown): v is CurationInput =>
  isObj(v) &&
  isText(v.periodLabel, AI_LIMITS.periodLabel) &&
  isInt(v.count, 0, AI_LIMITS.count) &&
  Array.isArray(v.top) &&
  v.top.length <= AI_LIMITS.top &&
  v.top.every((t) => isObj(t) && isText(t.tag, AI_LIMITS.tag) && isInt(t.count, 0, AI_LIMITS.count)) &&
  Array.isArray(v.summaries) &&
  v.summaries.length <= AI_LIMITS.summaries &&
  v.summaries.every((s) => typeof s === "string" && s.length <= AI_LIMITS.summary);

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!isInput(body)) {
    return bad(
      `periodLabel(1~${AI_LIMITS.periodLabel}자), count, top[](최대 ${AI_LIMITS.top}개), summaries[](최대 ${AI_LIMITS.summaries}개 × ${AI_LIMITS.summary}자)가 필요합니다`,
    );
  }

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    await consumeAiQuota(me.sb, me.user.id, "curate");
    return NextResponse.json(await textAI().writeCuration(body));
  } catch (err) {
    return fail(err);
  }
}
