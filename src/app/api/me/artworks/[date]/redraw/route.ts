// POST /api/me/artworks/:date/redraw  { scene, style, summary, tags, imagePath? } -> 200
// "다시 그리기": swaps that day's picture for a newly drawn one. The client runs summarize + draw
// first (each counted against the AI quota), then sends the result here.

import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { redrawArtwork } from "@/server/db/data";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { isOwnImagePath } from "@/server/ai/image";
import { type ArtworkInput, artworkInputError, isDateKey } from "@/server/validate";

export async function POST(req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isDateKey(date)) return bad("date: YYYY-MM-DD가 필요합니다");
  const b = await readJson(req);
  if (!isObj(b)) return bad("scene, style, summary, tags가 필요합니다");
  const problem = artworkInputError(b);
  if (problem) return bad(problem);
  const a = b as ArtworkInput;

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    if (a.imagePath != null && !isOwnImagePath(a.imagePath, me.user.id, date)) return bad("그림 파일이 올바르지 않아요");
    await redrawArtwork(me.sb, me.user.id, { date, scene: a.scene, style: a.style, summary: a.summary, tags: a.tags, imagePath: a.imagePath ?? null });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
