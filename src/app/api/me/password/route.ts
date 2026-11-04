// PUT /api/me/password  { current, next } -> 200
// Signs out every other device; this browser stays signed in.

import { NextResponse } from "next/server";
import { checkPassword, requireUser } from "@/server/auth";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";

export async function PUT(req: Request) {
  const b = await readJson(req);
  if (!isObj(b) || typeof b.current !== "string" || typeof b.next !== "string") {
    return bad("current, next가 필요합니다");
  }
  if (b.next.length < 8 || b.next.length > 72) return bad("새 비밀번호는 8자 이상이어야 해요");

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    if (!(await checkPassword(me.user.email ?? "", b.current))) {
      return NextResponse.json({ error: "지금 비밀번호가 맞지 않아요" }, { status: 403 });
    }
    const { error } = await me.sb.auth.updateUser({ password: b.next });
    if (error) {
      if (error.code === "same_password") return bad("지금과 다른 비밀번호를 써주세요");
      if (error.code === "weak_password") return bad("더 어려운 비밀번호를 써주세요");
      throw error;
    }
    await me.sb.auth.signOut({ scope: "others" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
