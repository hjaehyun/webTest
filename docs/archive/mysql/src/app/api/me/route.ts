// GET /api/me -> DB (the signed-in user's whole diary), 401 when signed out
// DELETE /api/me  { password } -> 200, account and all its data removed

import { NextResponse } from "next/server";
import { currentUserId, endSession, verifyPassword } from "@/server/auth";
import { deleteUser, loadDb, passwordHashOf } from "@/server/db/data";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";

export async function DELETE(req: Request) {
  const b = await readJson(req);
  if (!isObj(b) || typeof b.password !== "string") return bad("password가 필요합니다");

  try {
    const userId = await currentUserId();
    if (!userId) return unauthorized();
    const stored = await passwordHashOf(userId);
    if (!stored || !(await verifyPassword(b.password, stored))) {
      return NextResponse.json({ error: "비밀번호가 맞지 않아요" }, { status: 403 });
    }
    await deleteUser(userId);
    await endSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return unauthorized();
    return NextResponse.json(await loadDb(userId));
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
