// POST /api/draw  { summary: DaySummary, style: StyleId, date? } -> Drawing { scene, imagePath, imageUrl }
// Image AI step: the scene description becomes one picture in the user's style.
// Signed-in users only, size-capped, and counted against the daily AI quota (H1).
// A real picture goes into the user's folder of the private bucket; any failure leaves imagePath null
// and the scene placeholder is shown, so drawing never fails closing a day (specs/haru-image-ai.spl).

import { NextResponse } from "next/server";
import type { DaySummary } from "@/lib/types";
import { imageAI } from "@/server/ai";
import { requireUser } from "@/server/auth";
import { newImagePath } from "@/server/ai/image";
import { signImagePaths, uploadImage } from "@/server/db/images";
import { consumeAiQuota } from "@/server/db/quota";
import { bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { AI_LIMITS, STYLE_IDS, isDateKey, isScene, isStyle, isTagList, isText } from "@/server/validate";

// A slow first image model can take up to 45s before the next one answers (src/server/ai/cloudflare.ts).
export const maxDuration = 60;

const todaySeoul = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

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
  if (body.date !== undefined && !isDateKey(body.date)) return bad("date: YYYY-MM-DD가 필요합니다");
  const date = (body.date as string | undefined) ?? todaySeoul();

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    await consumeAiQuota(me.sb, me.user.id, "draw");
    const drawn = await imageAI().draw(body.summary, body.style);
    let imagePath: string | null = null;
    if (drawn.image) {
      const path = newImagePath(me.user.id, date);
      if (await uploadImage(me.sb, path, drawn.image)) imagePath = path;
    }
    const imageUrl = imagePath ? ((await signImagePaths([imagePath])).get(imagePath) ?? null) : null;
    return NextResponse.json({ scene: drawn.scene, imagePath, imageUrl });
  } catch (err) {
    return fail(err);
  }
}
