// Song match key: mood | weather | time_of_day, each from a fixed list so different users' days
// land on the same key and can share song_pool. The lists must match supabase/schema.sql.
// Pure functions only (run by node --test without the Next.js build), so: type-only imports.

import type { Mood, TimeOfDay, WeatherKey } from "@/lib/types";

export const MOODS: Mood[] = ["calm", "upbeat", "flutter", "proud", "lazy", "tired", "blue", "nostalgic", "busy", "cozy"];
export const WEATHERS: WeatherKey[] = ["clear", "cloudy", "rain", "snow", "hot", "unknown"];
export const TIMES: TimeOfDay[] = ["morning", "day", "night"];

export const isMood = (v: unknown): v is Mood => MOODS.includes(v as Mood);
export const isWeather = (v: unknown): v is WeatherKey => WEATHERS.includes(v as WeatherKey);
export const isTimeOfDay = (v: unknown): v is TimeOfDay => TIMES.includes(v as TimeOfDay);

export type SongKey = { mood: Mood; weather: WeatherKey; time: TimeOfDay };

const MOOD_WORDS: Record<Mood, string> = {
  calm: "잔잔한",
  upbeat: "신나는",
  flutter: "설레는",
  proud: "뿌듯한",
  lazy: "나른한",
  tired: "지친 날 위로가 되는",
  blue: "우울할 때 듣는",
  nostalgic: "그리운",
  busy: "바쁜 날 힘나는",
  cozy: "포근한",
};
const WEATHER_WORDS: Record<WeatherKey, string> = {
  clear: "맑은 날",
  cloudy: "흐린 날",
  rain: "비 오는 날",
  snow: "눈 오는 날",
  hot: "더운 날",
  unknown: "",
};
const TIME_WORDS: Record<TimeOfDay, string> = { morning: "아침에", day: "오후에", night: "밤에" };

/** Asia/Seoul hour -> bucket: morning 05-11, day 11-18, night 18-05. */
function bucket(iso: string): TimeOfDay {
  const h = (new Date(iso).getUTCHours() + 9) % 24;
  return h >= 5 && h < 11 ? "morning" : h >= 11 && h < 18 ? "day" : "night";
}

/** The bucket most of the day's fragments were written in; a tie goes to the later bucket. */
export function timeOfDay(isoTimes: string[]): TimeOfDay {
  if (isoTimes.length === 0) return "day";
  const counts: Record<TimeOfDay, number> = { morning: 0, day: 0, night: 0 };
  for (const t of isoTimes) counts[bucket(t)]++;
  let best: TimeOfDay = "morning";
  for (const t of TIMES) if (counts[t] >= counts[best]) best = t;
  return best;
}

/** YouTube search words, e.g. "비 오는 날 밤에 잔잔한 노래". */
export function songQuery(k: SongKey): string {
  return [WEATHER_WORDS[k.weather], TIME_WORDS[k.time], MOOD_WORDS[k.mood], "노래"].filter(Boolean).join(" ");
}
