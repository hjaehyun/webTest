// GET /api/me -> DB (the signed-in user's whole diary), 401 when signed out
// DELETE /api/me  { password } -> 200, account and all its data removed

import { NextResponse } from "next/server";
import { checkPassword, clearAuthCookies, requireUser } from "@/server/auth";
import { loadDb } from "@/server/db/data";
import { removeUserImages } from "@/server/db/images";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { supabaseAdmin } from "@/server/supabase";

export async function GET() {
  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    return NextResponse.json(await loadDb(me.sb, me.user));
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}

export async function DELETE(req: Request) {
  const b = await readJson(req);
  if (!isObj(b) || typeof b.password !== "string") return bad("password가 필요합니다");

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    if (!(await checkPassword(me.user.email ?? "", b.password))) {
      return NextResponse.json({ error: "비밀번호가 맞지 않아요" }, { status: 403 });
    }
    // Picture files aren't rows, so they go first; then deleting the auth user cascades to every table.
    await removeUserImages(me.user.id);
    const { error } = await supabaseAdmin().auth.admin.deleteUser(me.user.id);
    if (error) throw error;
    await clearAuthCookies();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
