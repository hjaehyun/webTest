// Weather provider for a fragment (specs/haru-weather.spl): env WEATHER_PROVIDER = kma | mock (unset = no weather).
// kma = 기상청 단기예보 조회서비스, 초단기예보 (getUltraSrtFcst), key KMA_SERVICE_KEY (server only, the
// "Decoding" general key from data.go.kr). Never fails the caller: any problem -> null (no weather).
// Coordinates are only used to compute the grid here; they are never logged or stored.

import type { EntryWeather } from "@/lib/types";
import { baseTimes, latLonToGrid, pickWeather } from "./core";

const ENDPOINT = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst";
const TIMEOUT_MS = 3000; // whole lookup, both tries: saving a fragment must not wait longer

type Coords = { lat: number; lon: number };

async function kma(coords: Coords): Promise<EntryWeather | null> {
  const key = process.env.KMA_SERVICE_KEY;
  if (!key) return null;
  const { nx, ny } = latLonToGrid(coords.lat, coords.lon);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (const base of baseTimes(new Date())) {
    const params = new URLSearchParams({
      serviceKey: key,
      pageNo: "1",
      numOfRows: "60",
      dataType: "JSON",
      base_date: base.date,
      base_time: base.time,
      nx: String(nx),
      ny: String(ny),
    });
    const res = await fetch(`${ENDPOINT}?${params}`, { signal, cache: "no-store" });
    const json = (await res.json().catch(() => null)) as {
      response?: { header?: { resultCode?: string }; body?: { items?: { item?: unknown } } };
    } | null;
    const code = json?.response?.header?.resultCode;
    if (code === "03") continue; // NO_DATA: this forecast isn't out yet, try the previous one
    if (!res.ok || code !== "00") throw new Error(`kma ${res.status} ${code ?? "no result code"}`);
    return pickWeather(json?.response?.body?.items?.item);
  }
  return null;
}

/** Weather at these (already rounded, in-Korea) coordinates, or null. */
export async function weatherAt(coords: Coords | null): Promise<EntryWeather | null> {
  if (!coords) return null;
  const provider = process.env.WEATHER_PROVIDER;
  // Unset means no weather (not mock), so a deployment without the env var never stores made-up weather.
  if (provider === "mock") return { weather: "clear", tempC: 15 };
  if (provider !== "kma") return null;
  try {
    return await kma(coords);
  } catch (err) {
    console.warn("[weather] lookup failed, saving without weather:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
