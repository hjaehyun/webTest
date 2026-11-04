// POST /api/auth/signup  { email, password } -> 201 signed in, or 200 { confirm: true }
// when the Supabase project still requires email confirmation.

import { NextResponse } from "next/server";
import { DB_FAILED, bad, fail, isObj, readJson } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";
import { isEmail } from "@/server/validate";

const TAKEN = () => NextResponse.json({ error: "이미 가입된 이메일이에요" }, { status: 409 });

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!isObj(body)) return bad("email, password가 필요합니다");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const { password } = body;
  if (!isEmail(email)) return bad("이메일 형식이 아니에요");
  if (typeof password !== "string" || password.length < 8 || password.length > 72) {
    return bad("비밀번호는 8자 이상이어야 해요");
  }

  try {
    const sb = await supabaseForRequest();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) {
      if (error.code === "user_already_exists") return TAKEN();
      if (error.code === "weak_password") return bad("더 어려운 비밀번호를 써주세요");
      if (error.code === "email_address_invalid") return bad("쓸 수 없는 이메일 주소예요");
      if (error.code === "over_email_send_rate_limit" || error.status === 429) {
        return NextResponse.json({ error: "가입 요청이 너무 많아요. 잠시 후 다시 해주세요" }, { status: 429 });
      }
      throw error;
    }
    // With confirmation on, Supabase hides existing emails behind a user with no identities.
    if (data.user && data.user.identities?.length === 0) return TAKEN();
    if (!data.session) return NextResponse.json({ ok: true, confirm: true });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
