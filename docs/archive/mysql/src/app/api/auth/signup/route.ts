// POST /api/auth/signup  { email, password } -> 201, signed in

import { NextResponse } from "next/server";
import { hashPassword, startSession } from "@/server/auth";
import { createUser } from "@/server/db/data";
import { DB_FAILED, bad, fail, isObj, readJson } from "@/server/http";
import { isEmail } from "@/server/validate";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!isObj(body)) return bad("email, password가 필요합니다");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const { password } = body;
  if (!isEmail(email)) return bad("이메일 형식이 아니에요");
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    return bad("비밀번호는 8자 이상이어야 해요");
  }

  try {
    const userId = await createUser(email, await hashPassword(password));
    await startSession(userId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
