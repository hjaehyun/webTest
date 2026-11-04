// POST /api/auth/logout -> 200, session revoked and cookies cleared

import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/server/auth";
import { DB_FAILED, fail } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";

export async function POST() {
  try {
    const sb = await supabaseForRequest();
    await sb.auth.signOut({ scope: "local" });
    await clearAuthCookies();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
