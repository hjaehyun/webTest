// Fills song_pool ahead of time so first users don't wait on YouTube:
// every mood x weather "unknown" x time of day = 30 searches (YouTube search quota is ~100 a day).
//
//   node scripts/seed-song-pool.mjs            (run from haru-jogak/)
//
// Reads SUPABASE_URL, SUPABASE_SECRET_KEY, YOUTUBE_API_KEY from .env.local and never prints them.
// Safe to re-run: existing songs only get their fetched_at refreshed (the 30-day YouTube data rule).
// Uses the same query words and result filter as the app (TypeScript files, loaded by Node 24).

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { MOODS, TIMES, songQuery } from "../src/server/music/key.ts";
import { parseSearchResponse } from "../src/server/music/parse.ts";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
for (const k of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "YOUTUBE_API_KEY"]) {
  if (!env[k]) {
    console.error(`${k} is not set in .env.local`);
    process.exit(1);
  }
}
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const keys = MOODS.flatMap((mood) => TIMES.map((time) => ({ mood, weather: "unknown", time })));
let done = 0;
for (const key of keys) {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "5",
    videoCategoryId: "10",
    videoEmbeddable: "true",
    videoDuration: "medium",
    regionCode: "KR",
    relevanceLanguage: "ko",
    safeSearch: "strict",
    q: songQuery(key),
    key: env.YOUTUBE_API_KEY,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = json?.error?.errors?.[0]?.reason ?? res.status;
    console.error(`stopped at ${key.mood}|${key.time}: ${reason}. ${keys.length - done} keys left; run again tomorrow.`);
    process.exit(1);
  }
  const now = new Date().toISOString();
  const rows = parseSearchResponse(json).map((h) => ({
    mood: key.mood,
    weather: key.weather,
    time_of_day: key.time,
    video_id: h.videoId,
    title: h.title,
    channel: h.channel,
    fetched_at: now,
  }));
  if (rows.length) {
    const { error } = await admin.from("song_pool").upsert(rows, { onConflict: "mood,weather,time_of_day,video_id" });
    if (error) {
      console.error(`db error at ${key.mood}|${key.time}: ${error.code} ${error.message}`);
      process.exit(1);
    }
  }
  done++;
  console.log(`${key.mood}|${key.weather}|${key.time}: ${rows.length}곡`);
}
console.log(`done: ${done}/${keys.length} keys`);
