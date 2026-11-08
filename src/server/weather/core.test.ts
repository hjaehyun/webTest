import assert from "node:assert/strict";
import { test } from "node:test";
import { baseTimes, checkCoords, latLonToGrid, pickWeather, weatherWord } from "./core.ts";

test("latLonToGrid: KMA grid (LCC)", () => {
  assert.deepEqual(latLonToGrid(37.57, 126.98), { nx: 60, ny: 127 }); // Seoul city hall
  assert.deepEqual(latLonToGrid(35.18, 129.08), { nx: 98, ny: 76 }); // Busan city hall
  assert.deepEqual(latLonToGrid(33.5, 126.53), { nx: 53, ny: 38 }); // Jeju city
});

test("baseTimes: latest HH30 published 45+ minutes ago (KST), then one hour earlier", () => {
  // 2026-11-08 14:50 KST = 05:50Z -> 1430, fallback 1330
  assert.deepEqual(baseTimes(new Date("2026-11-08T05:50:00Z")), [
    { date: "20261108", time: "1430" },
    { date: "20261108", time: "1330" },
  ]);
  // 14:40 KST -> 1330 (1430 not ready yet), fallback 1230
  assert.deepEqual(baseTimes(new Date("2026-11-08T05:40:00Z"))[0], { date: "20261108", time: "1330" });
  // 00:10 KST -> previous day 2330
  assert.deepEqual(baseTimes(new Date("2026-11-07T15:10:00Z"))[0], { date: "20261107", time: "2330" });
});

const item = (category: string, fcstTime: string, fcstValue: string) => ({ category, fcstDate: "20261108", fcstTime, fcstValue });

test("pickWeather: nearest forecast hour; rain wins over sky; temperature rounded", () => {
  const items = [
    item("SKY", "1600", "4"), item("PTY", "1600", "0"), item("T1H", "1600", "11.6"),
    item("SKY", "1500", "1"), item("PTY", "1500", "1"), item("T1H", "1500", "12.4"),
  ];
  assert.deepEqual(pickWeather(items), { weather: "rain", tempC: 12 });
  assert.deepEqual(pickWeather([item("SKY", "1500", "3"), item("PTY", "1500", "0"), item("T1H", "1500", "-0.6")]), { weather: "cloudy", tempC: -1 });
  assert.deepEqual(pickWeather([item("SKY", "1500", "1"), item("PTY", "1500", "7"), item("T1H", "1500", "1")]), { weather: "snow", tempC: 1 });
  assert.deepEqual(pickWeather([item("SKY", "1500", "1"), item("PTY", "1500", "6"), item("T1H", "1500", "2")]), { weather: "rain_snow", tempC: 2 });
  assert.deepEqual(pickWeather([item("SKY", "1500", "4"), item("PTY", "1500", "4"), item("T1H", "1500", "20")]), { weather: "shower", tempC: 20 });
});

test("pickWeather: unusable answers -> null", () => {
  assert.equal(pickWeather([]), null);
  assert.equal(pickWeather([item("T1H", "1500", "12")]), null); // no sky/precipitation
  assert.equal(pickWeather([item("SKY", "1500", "9"), item("PTY", "1500", "0"), item("T1H", "1500", "12")]), null); // unknown code
  assert.equal(pickWeather([item("SKY", "1500", "1"), item("PTY", "1500", "0"), item("T1H", "1500", "abc")]), null);
  assert.equal(pickWeather("x" as unknown as []), null);
});

test("checkCoords: both or neither, at most 2 decimals, Korea only", () => {
  assert.deepEqual(checkCoords(undefined, undefined), { ok: true, coords: null });
  assert.deepEqual(checkCoords(37.57, 126.98), { ok: true, coords: { lat: 37.57, lon: 126.98 } });
  assert.deepEqual(checkCoords(37.5, 127), { ok: true, coords: { lat: 37.5, lon: 127 } });
  assert.equal(checkCoords(37.5665, 126.978).ok, false); // too precise
  assert.equal(checkCoords(37.57, undefined).ok, false); // only one
  assert.equal(checkCoords("37.57", 126.98).ok, false);
  assert.equal(checkCoords(Number.NaN, 126.98).ok, false);
  assert.deepEqual(checkCoords(48.85, 2.35), { ok: true, coords: null }); // Paris: accepted, no weather
});

test("weatherWord for the Gemini line", () => {
  assert.equal(weatherWord({ weather: "rain", tempC: 12 }), "비, 12℃");
  assert.equal(weatherWord({ weather: "clear", tempC: -3 }), "맑음, -3℃");
});
