// POST /api/me/artworks/:date/song  { reroll?: boolean } -> { song: Song | null, unchanged: boolean }
// Recommends a song for that day's picture (shared song_pool, YouTube search only when the pool is thin).
// Signed-in users only; counts against the daily "song" quota (10, supabase/schema.sql).

import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { consumeAiQuota } from "@/server/db/quota";
import { assignSong } from "@/server/db/songs";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { isDateKey } from "@/server/validate";

export async function POST(req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isDateKey(date)) return bad("date: YYYY-MM-DD가 필요합니다");
  const b = await readJson(req);
  if (b !== null && !isObj(b)) return bad("본문은 { reroll?: boolean } 이어야 해요");
  const reroll = isObj(b) && b.reroll === true;

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    await consumeAiQuota(me.sb, me.user.id, "song");
    return NextResponse.json(await assignSong(me.sb, me.user.id, date, reroll));
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
