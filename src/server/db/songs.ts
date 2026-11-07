// Song recommendation (docs/superpowers/specs/2026-11-05-song-recommendation-design.md).
// The user's client reads their own picture, entries and reactions; song_pool is shared and only
// written with the secret key, so a user can never add a video. No diary text leaves this file:
// YouTube only ever sees the fixed-word query built from the match key.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Song } from "@/lib/types";
import { debugLog } from "../debug";
import { HttpError } from "../http";
import { music } from "../music";
import { type SongKey, isMood, songQuery, timeOfDay } from "../music/key";
import { safeSearch } from "../music/safe";
import { supabaseAdmin } from "../supabase";

const DAY_MS = 864e5;
const FRESH_DAYS = 30; // YouTube Developer Policies III.E.4: refresh or delete API data after 30 days
const RECENT_DAYS = 7; // a user doesn't get the same song twice within a week
const MIN_CANDIDATES = 3; // fewer fresh songs than this for a key -> search YouTube

type PoolRow = { id: number; video_id: string; title: string; channel: string };
export const toSong = (r: PoolRow): Song => ({ id: r.id, videoId: r.video_id, title: r.title, channel: r.channel });

function check(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if (error.code === "P0002") throw new HttpError(404, "이날은 그림이 없어요");
  if (error.code === "23503") throw new HttpError(404, "없는 노래예요");
  throw new Error(`${error.code} ${error.message}`);
}

const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();
const dayMinus = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);

/** Records the user's reaction to a pool song (1 = like, -1 = "다른 곡"); a later one replaces it. */
export async function voteSong(sb: SupabaseClient, userId: string, songId: number, vote: 1 | -1): Promise<void> {
  const { error } = await sb.from("song_feedback").upsert({ user_id: userId, song_id: songId, vote }, { onConflict: "user_id,song_id" });
  check(error);
}

async function loadSong(sb: SupabaseClient, id: number): Promise<Song | null> {
  const { data, error } = await sb.from("song_pool").select("id, video_id, title, channel").eq("id", id).maybeSingle();
  check(error);
  return data ? toSong(data as PoolRow) : null;
}

/**
 * Fills the pool for a key from the music provider. Never fails the request: a search error, timeout,
 * quota or missing key (safeSearch) or a pool write error is logged and the pool answers as it is.
 */
async function refill(key: SongKey): Promise<void> {
  const hits = await safeSearch(music(), songQuery(key));
  if (!hits.length) return;
  const now = new Date().toISOString();
  const rows = hits.map((h) => ({ mood: key.mood, weather: key.weather, time_of_day: key.time, video_id: h.videoId, title: h.title, channel: h.channel, fetched_at: now }));
  const { error } = await supabaseAdmin().from("song_pool").upsert(rows, { onConflict: "mood,weather,time_of_day,video_id" });
  if (error) {
    console.warn("[song] pool write failed:", error.code, error.message);
    return;
  }
  debugLog("song", "pool refilled", { key, count: rows.length });
}

/**
 * Gives the day's picture a song. `reroll` = "다른 곡": the current song gets a -1 and is never offered
 * to this user again. Without reroll an existing song is kept (the call is idempotent).
 * unchanged: true when no other song was available and the current one stays.
 */
export async function assignSong(
  sb: SupabaseClient,
  userId: string,
  date: string,
  reroll: boolean,
): Promise<{ song: Song | null; unchanged: boolean }> {
  const [artRes, entryRes] = await Promise.all([
    sb.from("daily_artworks").select("id, mood, song_id").eq("user_id", userId).eq("day", date).maybeSingle(),
    sb.from("entries").select("written_at").eq("user_id", userId).eq("day", date),
  ]);
  check(artRes.error);
  check(entryRes.error);
  const art = artRes.data as { id: number; mood: string | null; song_id: number | null } | null;
  if (!art) throw new HttpError(404, "이날은 그림이 없어요");

  const current = art.song_id;
  if (!reroll && current != null) {
    const song = await loadSong(sb, current);
    if (song) return { song, unchanged: true };
  }

  // Old YouTube data goes first (policy), so it can't be picked below.
  const cleanup = await supabaseAdmin().from("song_pool").delete().lt("fetched_at", isoDaysAgo(FRESH_DAYS));
  if (cleanup.error) console.warn("[song] pool cleanup failed:", cleanup.error.message);

  const key: SongKey = {
    mood: isMood(art.mood) ? art.mood : "calm",
    weather: "unknown", // until the weather API is wired up
    time: timeOfDay((entryRes.data ?? []).map((e) => new Date(e.written_at as string).toISOString())),
  };

  if (reroll && current != null) await voteSong(sb, userId, current, -1);

  const [recentRes, skipRes, countRes] = await Promise.all([
    sb.from("daily_artworks").select("song_id").eq("user_id", userId).gte("day", dayMinus(date, RECENT_DAYS)).not("song_id", "is", null),
    sb.from("song_feedback").select("song_id").eq("user_id", userId).eq("vote", -1),
    sb
      .from("song_pool")
      .select("id", { count: "exact", head: true })
      .eq("mood", key.mood)
      .eq("weather", key.weather)
      .eq("time_of_day", key.time)
      .gt("fetched_at", isoDaysAgo(FRESH_DAYS)),
  ]);
  check(recentRes.error);
  check(skipRes.error);
  check(countRes.error);
  if ((countRes.count ?? 0) < MIN_CANDIDATES) await refill(key);

  const exclude = [
    ...new Set([
      ...(recentRes.data ?? []).map((r) => r.song_id as number),
      ...(skipRes.data ?? []).map((r) => r.song_id as number),
      ...(current != null ? [current] : []),
    ]),
  ];

  // Exact key first, then widen: any time of day, then any weather too.
  let picked: number | null = null;
  for (const [weather, time] of [
    [key.weather, key.time],
    [key.weather, null],
    [null, null],
  ] as const) {
    const { data, error } = await sb.rpc("pick_song", { p_mood: key.mood, p_weather: weather, p_time: time, p_exclude: exclude });
    check(error);
    if (data != null) {
      picked = Number(data);
      break;
    }
  }

  if (picked == null) {
    const song = current != null ? await loadSong(sb, current) : null;
    debugLog("song", "nothing new", { userId, date, key });
    return { song, unchanged: song != null };
  }

  const set = await sb.rpc("set_artwork_song", { p_day: date, p_song_id: picked, p_weather: key.weather, p_time: key.time });
  check(set.error);
  debugLog("song", "assigned", { userId, date, key, songId: picked });
  return { song: await loadSong(sb, picked), unchanged: false };
}
