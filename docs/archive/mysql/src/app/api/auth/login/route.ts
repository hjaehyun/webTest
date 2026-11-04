// POST /api/auth/login  { email, password } -> 200, signed in

import { NextResponse } from "next/server";
import { startSession, verifyNobody, verifyPassword } from "@/server/auth";
import { findUserByEmail } from "@/server/db/data";
import { DB_FAILED, bad, fail, isObj, readJson } from "@/server/http";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!isObj(body) || typeof body.email !== "string" || typeof body.password !== "string") {
    return bad("email, password가 필요합니다");
  }
  const email = body.email.trim().toLowerCase();

  try {
    const user = await findUserByEmail(email);
    const ok = user ? await verifyPassword(body.password, user.passwordHash) : await verifyNobody(body.password);
    // Same message either way, so the form doesn't reveal which emails have accounts.
    if (!user || !ok) return NextResponse.json({ error: "이메일 또는 비밀번호가 맞지 않아요" }, { status: 401 });
    await startSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
