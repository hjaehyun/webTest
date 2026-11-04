// POST /api/auth/logout -> 200, cookie cleared

import { NextResponse } from "next/server";
import { endSession } from "@/server/auth";
import { DB_FAILED, fail } from "@/server/http";

export async function POST() {
  try {
    await endSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
