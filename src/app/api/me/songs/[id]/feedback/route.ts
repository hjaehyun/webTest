// POST /api/me/songs/:id/feedback  { vote: 1 | -1 } -> { ok: true }
// The user's reaction to a pool song; pick_song() weighs songs by everyone's reactions.

import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { voteSong } from "@/server/db/songs";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,17}$/.test(id)) return bad("id: 양의 정수가 필요합니다");
  const b = await readJson(req);
  if (!isObj(b) || (b.vote !== 1 && b.vote !== -1)) return bad("vote: 1 또는 -1이 필요합니다");

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    await voteSong(me.sb, me.user.id, Number(id), b.vote);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
