// PUT /api/me/password  { current, next } -> 200
// Signs out every other device; this browser gets a fresh session.

import { NextResponse } from "next/server";
import { currentUserId, hashPassword, startSession, verifyPassword } from "@/server/auth";
import { changePassword, passwordHashOf } from "@/server/db/data";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";

export async function PUT(req: Request) {
  const b = await readJson(req);
  if (!isObj(b) || typeof b.current !== "string" || typeof b.next !== "string") {
    return bad("current, next가 필요합니다");
  }
  if (b.next.length < 8 || b.next.length > 200) return bad("새 비밀번호는 8자 이상이어야 해요");

  try {
    const userId = await currentUserId();
    if (!userId) return unauthorized();
    const stored = await passwordHashOf(userId);
    if (!stored || !(await verifyPassword(b.current, stored))) {
      return NextResponse.json({ error: "지금 비밀번호가 맞지 않아요" }, { status: 403 });
    }
    await changePassword(userId, await hashPassword(b.next));
    await startSession(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
