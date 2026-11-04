// POST /api/draw  { summary: DaySummary, style: StyleId } -> Drawing
// Image AI step: the scene description becomes one picture in the user's style.

import { NextResponse } from "next/server";
import type { DaySummary } from "@/lib/types";
import { imageAI } from "@/server/ai";
import { bad, fail, isObj, readJson } from "@/server/http";
import { STYLE_IDS, isScene, isStyle } from "@/server/validate";

const isSummary = (v: unknown): v is DaySummary =>
  isObj(v) && typeof v.summary === "string" && isScene(v.scene) && Array.isArray(v.tags);

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!isObj(body) || !isSummary(body.summary)) return bad("summary: DaySummary가 필요합니다");
  if (!isStyle(body.style)) return bad(`style: ${STYLE_IDS.join(" | ")} 중 하나여야 합니다`);

  try {
    return NextResponse.json(await imageAI().draw(body.summary, body.style));
  } catch (err) {
    return fail(err);
  }
}
