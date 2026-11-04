// POST /api/me/artworks  { date, scene, style, summary, tags } -> 201
// Closes the day: that day's entries become this picture's entries.

import { NextResponse } from "next/server";
import { currentUserId } from "@/server/auth";
import { saveArtwork } from "@/server/db/data";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { isDateKey, isScene, isStyle } from "@/server/validate";

export async function POST(req: Request) {
  const b = await readJson(req);
  if (!isObj(b) || !isDateKey(b.date)) return bad("date: YYYY-MM-DD가 필요합니다");
  if (!isScene(b.scene) || !isStyle(b.style)) return bad("scene, style이 올바르지 않아요");
  if (typeof b.summary !== "string" || !b.summary.trim()) return bad("summary가 필요합니다");
  if (!Array.isArray(b.tags) || !b.tags.every((t) => typeof t === "string")) return bad("tags: string[]이 필요합니다");

  try {
    const userId = await currentUserId();
    if (!userId) return unauthorized();
    await saveArtwork(userId, { date: b.date, scene: b.scene, style: b.style, summary: b.summary, tags: b.tags });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
