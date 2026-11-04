// POST /api/auth/login  { email, password } -> 200, signed in

import { NextResponse } from "next/server";
import { DB_FAILED, bad, fail, isObj, readJson } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!isObj(body) || typeof body.email !== "string" || typeof body.password !== "string") {
    return bad("email, password가 필요합니다");
  }

  try {
    const sb = await supabaseForRequest();
    const { error } = await sb.auth.signInWithPassword({
      email: body.email.trim().toLowerCase(),
      password: body.password,
    });
    if (error) {
      if (error.code === "email_not_confirmed") {
        return NextResponse.json({ error: "메일함에서 인증 링크를 먼저 눌러주세요" }, { status: 403 });
      }
      // Same message for unknown email and wrong password.
      if (error.code === "invalid_credentials") {
        return NextResponse.json({ error: "이메일 또는 비밀번호가 맞지 않아요" }, { status: 401 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
