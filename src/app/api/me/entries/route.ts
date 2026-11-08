// POST /api/me/entries  { date, entry: { id, at, text }, lat?, lon? } -> 201
// lat/lon (optional, 2 decimals) only look up the weather at that moment (specs/haru-weather.spl);
// they are never stored or logged. No location or no weather still saves the fragment.
// The client makes the id and timestamp so it can show the entry before the server answers.

import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { addEntry } from "@/server/db/data";
import { DB_FAILED, bad, fail, isObj, readJson, unauthorized } from "@/server/http";
import { isDateKey, isIsoTime, isText, isUuid } from "@/server/validate";
import { checkCoords } from "@/server/weather/core";
import { weatherAt } from "@/server/weather";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!isObj(body) || !isDateKey(body.date)) return bad("date: YYYY-MM-DD가 필요합니다");
  const e = body.entry;
  if (!isObj(e) || !isUuid(e.id) || !isIsoTime(e.at) || !isText(e.text, 140)) {
    return bad("entry: { id(uuid), at(ISO), text(1~140자) }가 필요합니다");
  }
  const loc = checkCoords(body.lat, body.lon);
  if (!loc.ok) return bad("lat, lon: 둘 다 소수점 2자리 이하 숫자여야 해요");

  try {
    const me = await requireUser();
    if (!me) return unauthorized();
    const weather = await weatherAt(loc.coords);
    await addEntry(me.sb, me.user.id, body.date, { id: e.id, at: e.at, text: e.text, weather });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
