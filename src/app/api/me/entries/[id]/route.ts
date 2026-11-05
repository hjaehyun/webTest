// PATCH  /api/me/entries/:id  { text } -> 200 (drafts only; day and time stay as written)
// DELETE /api/me/entries/:id           -> 200 (drafts only)

import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { removeEntry, updateEntry } from "@/server/db/data";
import { debugLog } from "@/server/debug";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { isText, isUuid } from "@/server/validate";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return bad("id가 올바르지 않아요");
  const body = await readJson(req);
  if (!isObj(body) || !isText(body.text, 140)) return bad("text: 1~140자가 필요합니다");

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    await updateEntry(me.sb, me.user.id, id, body.text);
    // Never log the text itself (debug.ts).
    debugLog("entries", "edited", { id, length: body.text.length });
    return NextResponse.json({ ok: true });
  } catch (err) {
    debugLog("entries", "edit failed", { id, error: err instanceof Error ? err.message : String(err) });
    return fail(err, DB_FAILED);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
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
