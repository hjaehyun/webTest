import assert from "node:assert/strict";
import { test } from "node:test";
import { MOODS, isMood, isTimeOfDay, isWeather, songQuery, timeOfDay } from "./key.ts";

test("timeOfDay: KST boundaries", () => {
  assert.equal(timeOfDay(["2026-11-06T19:59:00.000Z"]), "night"); // 04:59 KST
  assert.equal(timeOfDay(["2026-11-06T20:00:00.000Z"]), "morning"); // 05:00 KST
  assert.equal(timeOfDay(["2026-11-07T02:00:00.000Z"]), "day"); // 11:00 KST
  assert.equal(timeOfDay(["2026-11-07T09:00:00.000Z"]), "night"); // 18:00 KST
});

test("timeOfDay: majority, tie goes later, empty is day", () => {
  assert.equal(
    timeOfDay(["2026-11-06T23:00:00.000Z", "2026-11-06T23:30:00.000Z", "2026-11-07T05:00:00.000Z"]),
    "morning",
  );
  assert.equal(timeOfDay(["2026-11-06T23:00:00.000Z", "2026-11-07T05:00:00.000Z"]), "day");
  assert.equal(timeOfDay([]), "day");
});

test("songQuery", () => {
  assert.equal(songQuery({ mood: "calm", weather: "rain", time: "night" }), "비 오는 날 밤에 잔잔한 노래");
  assert.equal(songQuery({ mood: "tired", weather: "unknown", time: "morning" }), "아침에 지친 날 위로가 되는 노래");
});

test("guards", () => {
  assert.equal(MOODS.length, 10);
  assert.ok(isMood("cozy") && !isMood("happy"));
  assert.ok(isWeather("unknown") && !isWeather("sunny"));
  assert.ok(isTimeOfDay("night") && !isTimeOfDay("evening"));
});
