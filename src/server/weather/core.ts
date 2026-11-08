// Weather for a fragment (specs/haru-weather.spl): KMA grid conversion, which forecast to ask for,
// and turning the answer into one of a few words. Pure (type-only imports) so node --test runs it.

import type { EntryWeather, WeatherCode } from "@/lib/types";

// ---- coordinates --------------------------------------------------------------

const KOREA = { latMin: 33, latMax: 39, lonMin: 124, lonMax: 132 };
const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

/**
 * Optional lat/lon from the client. Both or neither, at most 2 decimals (~1 km, the client rounds).
 * Outside Korea is accepted but gets no weather (KMA covers Korea only).
 */
export function checkCoords(lat: unknown, lon: unknown): { ok: true; coords: { lat: number; lon: number } | null } | { ok: false } {
  if (lat === undefined && lon === undefined) return { ok: true, coords: null };
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false };
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || !twoDecimals(lat) || !twoDecimals(lon)) return { ok: false };
  const inKorea = lat >= KOREA.latMin && lat <= KOREA.latMax && lon >= KOREA.lonMin && lon <= KOREA.lonMax;
  return { ok: true, coords: inKorea ? { lat, lon } : null };
}

/** KMA's official lat/lon -> 5 km grid (Lambert conformal conic). */
export function latLonToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const D = Math.PI / 180;
  const re = RE / GRID;
  const slat1 = SLAT1 * D, slat2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * D - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

// ---- which forecast -------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Ultra-short forecasts are issued at HH:30 (KST) and can be fetched from about HH:45.
 * Returns the newest one that should exist, then the one before it (tried if the first has no data yet).
 */
export function baseTimes(now: Date): { date: string; time: string }[] {
  const kst = new Date(now.getTime() + 9 * 3600e3);
  if (kst.getUTCMinutes() < 45) kst.setUTCHours(kst.getUTCHours() - 1);
  const at = (d: Date) => ({ date: `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}30` });
  const earlier = new Date(kst.getTime() - 3600e3);
  return [at(kst), at(earlier)];
}

// ---- answer -> word ---------------------------------------------------------------

const PTY: Record<string, WeatherCode | null> = { "0": null, "1": "rain", "2": "rain_snow", "3": "snow", "4": "shower", "5": "rain", "6": "rain_snow", "7": "snow" };
const SKY: Record<string, WeatherCode> = { "1": "clear", "3": "cloudy", "4": "overcast" };

type Item = { category?: unknown; fcstDate?: unknown; fcstTime?: unknown; fcstValue?: unknown };

/** The nearest forecast hour's weather: precipitation if any, else sky; temperature rounded. Null if unusable. */
export function pickWeather(items: unknown): EntryWeather | null {
  if (!Array.isArray(items)) return null;
  const byHour = new Map<string, Record<string, string>>();
  for (const it of items as Item[]) {
    if (typeof it?.category !== "string" || typeof it.fcstValue !== "string") continue;
    const key = `${it.fcstDate}${it.fcstTime}`;
    const row = byHour.get(key) ?? {};
    row[it.category] = it.fcstValue;
    byHour.set(key, row);
  }
  const nearest = [...byHour.keys()].sort()[0];
  const row = nearest ? byHour.get(nearest)! : null;
  if (!row || row.PTY === undefined || row.SKY === undefined || row.T1H === undefined) return null;
  if (!(row.PTY in PTY) || !(row.SKY in SKY)) return null;
  const t = Number(row.T1H);
  if (!Number.isFinite(t)) return null;
  return { weather: PTY[row.PTY] ?? SKY[row.SKY], tempC: Math.round(t) };
}

const WORDS: Record<WeatherCode, string> = {
  clear: "맑음",
  cloudy: "구름 많음",
  overcast: "흐림",
  rain: "비",
  rain_snow: "비와 눈",
  snow: "눈",
  shower: "소나기",
};

/** "비, 12℃" for the fragment line sent to the text AI. */
export const weatherWord = (w: EntryWeather): string => `${WORDS[w.weather]}, ${w.tempC}℃`;

export const WEATHER_CODES = Object.keys(WORDS) as WeatherCode[];
