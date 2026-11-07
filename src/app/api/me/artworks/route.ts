// POST /api/me/artworks  { date, scene, style, summary, tags, mood? } -> 201
// Closes the day: that day's entries become this picture's entries.

import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { saveArtwork } from "@/server/db/data";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { type ArtworkInput, artworkInputError, isDateKey } from "@/server/validate";

export async function POST(req: Request) {
  const b = await readJson(req);
  if (!isObj(b) || !isDateKey(b.date)) return bad("date: YYYY-MM-DD가 필요합니다");
  const problem = artworkInputError(b);
  if (problem) return bad(problem);
  const a = b as ArtworkInput & { date: string };

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    await saveArtwork(me.sb, me.user.id, { date: a.date, scene: a.scene, style: a.style, summary: a.summary, tags: a.tags, mood: a.mood });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
