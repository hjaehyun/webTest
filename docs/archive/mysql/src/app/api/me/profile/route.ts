// PUT /api/me/profile  { nick, style } -> 200

import { NextResponse } from "next/server";
import { currentUserId } from "@/server/auth";
import { saveProfile } from "@/server/db/data";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { isStyle, isText } from "@/server/validate";

export async function PUT(req: Request) {
  const body = await readJson(req);
  if (!isObj(body) || !isText(body.nick, 12)) return bad("nick: 1~12자가 필요합니다");
  if (!isStyle(body.style)) return bad("style이 올바르지 않아요");

  try {
    const userId = await currentUserId();
    if (!userId) return unauthorized();
    await saveProfile(userId, { nick: body.nick.trim(), style: body.style });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
