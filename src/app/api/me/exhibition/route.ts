// PATCH /api/me/exhibition  { isPublic?, dates? } -> 200
// `dates` is the full ordered list of hung pictures, not a diff.

import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { updateExhibition } from "@/server/db/data";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { isDateKey } from "@/server/validate";

export async function PATCH(req: Request) {
  const b = await readJson(req);
  if (!isObj(b)) return bad("isPublic 또는 dates가 필요합니다");
  if (b.isPublic !== undefined && typeof b.isPublic !== "boolean") return bad("isPublic: boolean이어야 합니다");
  if (b.dates !== undefined && !(Array.isArray(b.dates) && b.dates.every(isDateKey))) {
    return bad("dates: YYYY-MM-DD[]여야 합니다");
  }
  const dates = b.dates as string[] | undefined;
  if (dates && new Set(dates).size !== dates.length) return bad("dates에 중복이 있어요");

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    await updateExhibition(me.sb, me.user.id, { isPublic: b.isPublic as boolean | undefined, dates });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
