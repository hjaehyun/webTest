// POST /api/me/entries  { date, entry: { id, at, text } } -> 201
// The client makes the id and timestamp so it can show the entry before the server answers.

import { NextResponse } from "next/server";
import { currentUserId } from "@/server/auth";
import { addEntry } from "@/server/db/data";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { isDateKey, isIsoTime, isText, isUuid } from "@/server/validate";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!isObj(body) || !isDateKey(body.date)) return bad("date: YYYY-MM-DD가 필요합니다");
  const e = body.entry;
  if (!isObj(e) || !isUuid(e.id) || !isIsoTime(e.at) || !isText(e.text, 140)) {
    return bad("entry: { id(uuid), at(ISO), text(1~140자) }가 필요합니다");
  }

  try {
    const userId = await currentUserId();
    if (!userId) return unauthorized();
    await addEntry(userId, body.date, { id: e.id, at: e.at, text: e.text });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
