// DELETE /api/me/entries/:id -> 200 (drafts only)

import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { removeEntry } from "@/server/db/data";
import { DB_FAILED, bad, fail, unauthorized } from "@/server/http";
import { isUuid } from "@/server/validate";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return bad("id가 올바르지 않아요");

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    await removeEntry(me.sb, me.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
