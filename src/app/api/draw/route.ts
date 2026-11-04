// POST /api/draw  { summary: DaySummary, style: StyleId } -> Drawing
// Image AI step: the scene description becomes one picture in the user's style.
// Signed-in users only, size-capped, and counted against the daily AI quota (H1).

import { NextResponse } from "next/server";
import type { DaySummary } from "@/lib/types";
import { imageAI } from "@/server/ai";
import { requireUser } from "@/server/auth";
import { consumeAiQuota } from "@/server/db/quota";
import { bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { AI_LIMITS, STYLE_IDS, isScene, isStyle, isTagList, isText } from "@/server/validate";

const isSummary = (v: unknown): v is DaySummary =>
  isObj(v) && isText(v.summary, AI_LIMITS.summary) && isScene(v.scene) && isTagList(v.tags);

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!isObj(body) || !isSummary(body.summary)) {
    return bad(
      `summary: DaySummary(summary 1~${AI_LIMITS.summary}자, tags 최대 ${AI_LIMITS.tags}개 × ${AI_LIMITS.tag}자)가 필요합니다`,
    );
  }
  if (!isStyle(body.style)) return bad(`style: ${STYLE_IDS.join(" | ")} 중 하나여야 합니다`);

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    await consumeAiQuota(me.sb, me.user.id, "draw");
    return NextResponse.json(await imageAI().draw(body.summary, body.style));
  } catch (err) {
    return fail(err);
  }
}
