// Reads and writes of a user's diary through Supabase. The client passed in acts as the
// signed-in user, so Row Level Security (supabase/schema.sql) decides what each query may touch;
// the user_id filters here only keep results tidy.

import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js";
import type { Artwork, DB, Entry, EntryWeather, Mood, Profile, Scene, StyleId, WeatherCode } from "@/lib/types";
import { debugLog } from "../debug";
import { HttpError } from "../http";
import { accountInfo } from "../oauth";
import { removeImage, signImagePaths } from "./images";
import { toSong } from "./songs";

const DEFAULT_EXHIBITION_TITLE = "나의 전시";

// Postgres error codes we turn into user-facing answers.
const UNIQUE_VIOLATION = "23505";
const RLS_VIOLATION = "42501";
const CHECK_VIOLATION = "23514"; // a table check constraint (style, scene, summary/tags limits)
const NO_DATA_FOUND = "P0002";

function check(error: PostgrestError | null, known: Record<string, HttpError> = {}): void {
  if (!error) return;
  const mapped = known[error.code];
  if (mapped) throw mapped;
  throw new Error(`${error.code} ${error.message}`);
}

// ---- whole-diary read --------------------------------------------------------

/** Everything the screens need, in the same DB shape the localStorage store used. */
export async function loadDb(sb: SupabaseClient, user: User): Promise<DB> {
  const [profileRes, entryRes, artRes, exRes] = await Promise.all([
    sb.from("profiles").select("nick, style").eq("user_id", user.id).maybeSingle(),
    sb.from("entries").select("id, day, written_at, body, weather, temp_c").eq("user_id", user.id).order("written_at"),
    sb
      .from("daily_artworks")
      .select("day, style, scene, summary, tags, mood, image_path, song_pool(id, video_id, title, channel)")
      .eq("user_id", user.id)
      .eq("status", "done"),
    sb.from("exhibitions").select("id, title, description, is_public").eq("user_id", user.id).maybeSingle(),
  ]);
  check(profileRes.error);
  check(entryRes.error);
  check(artRes.error);
  check(exRes.error);

  const profile: Profile | null = profileRes.data
    ? { nick: profileRes.data.nick, style: profileRes.data.style as StyleId }
    : null;

  // Own pictures only (RLS), so signing them for the owner is fine.
  const signed = await signImagePaths((artRes.data ?? []).map((r) => r.image_path as string | null));
  const artworks: Record<string, Artwork> = {};
  for (const r of artRes.data ?? []) {
    artworks[r.day] = {
      date: r.day,
      scene: r.scene as Scene,
      style: r.style as StyleId,
      summary: r.summary,
      tags: r.tags,
      mood: (r.mood ?? null) as Mood | null,
      song: r.song_pool ? toSong(r.song_pool as unknown as Parameters<typeof toSong>[0]) : null,
      imageUrl: r.image_path ? (signed.get(r.image_path) ?? null) : null,
      entries: [],
    };
  }

  // An entry belongs to its day's picture once that day is closed; otherwise it is a draft.
  const drafts: Record<string, Entry[]> = {};
  for (const r of entryRes.data ?? []) {
    const entry: Entry = { id: r.id, at: new Date(r.written_at).toISOString(), text: r.body, weather: toWeather(r) };
    const art = artworks[r.day];
    if (art) art.entries.push(entry);
    else (drafts[r.day] ??= []).push(entry);
  }

  const ex = exRes.data;
  let dates: string[] = [];
  if (ex) {
    const items = await sb
      .from("exhibition_items")
      .select("position, daily_artworks(day)")
      .eq("exhibition_id", ex.id)
      .order("position");
    check(items.error);
    dates = (items.data ?? []).map((r) => (r.daily_artworks as unknown as { day: string }).day);
  }

  return {
    account: { email: user.email ?? "", joinedAt: user.created_at, ...accountInfo(user.identities) },
    profile,
    drafts,
    artworks,
    exhibition: ex
      ? { id: ex.id, title: ex.title, desc: ex.description, isPublic: ex.is_public, dates }
      : { id: "", title: DEFAULT_EXHIBITION_TITLE, desc: "", isPublic: false, dates: [] },
  };
}

// ---- writes ------------------------------------------------------------------

export async function saveProfile(sb: SupabaseClient, userId: string, p: Profile): Promise<void> {
  const { error } = await sb.from("profiles").upsert({ user_id: userId, nick: p.nick, style: p.style });
  check(error);
}

const toWeather = (r: { weather?: unknown; temp_c?: unknown }): EntryWeather | null =>
  typeof r.weather === "string" && typeof r.temp_c === "number" ? { weather: r.weather as WeatherCode, tempC: r.temp_c } : null;

/** Weather saved with the user's own fragments (RLS), by fragment id. For the scene summary. */
export async function entryWeathers(sb: SupabaseClient, userId: string, ids: string[]): Promise<Map<string, EntryWeather>> {
  const out = new Map<string, EntryWeather>();
  if (!ids.length) return out;
  const { data, error } = await sb.from("entries").select("id, weather, temp_c").eq("user_id", userId).in("id", ids);
  check(error);
  for (const r of data ?? []) {
    const w = toWeather(r);
    if (w) out.set(r.id as string, w);
  }
  return out;
}

export async function addEntry(sb: SupabaseClient, userId: string, day: string, e: Entry): Promise<void> {
  const { error } = await sb.from("entries").insert({
    id: e.id,
    user_id: userId,
    day,
    written_at: e.at,
    body: e.text,
    weather: e.weather?.weather ?? null,
    temp_c: e.weather?.tempC ?? null,
  });
  check(error, {
    // The insert policy refuses entries for a day that already has its picture.
    [RLS_VIOLATION]: new HttpError(409, "이미 마감한 날이에요"),
    [UNIQUE_VIOLATION]: new HttpError(409, "이미 저장된 조각이에요"),
  });
}

/** Deletes a draft entry. RLS keeps entries of a closed day, so those count as not found. */
export async function removeEntry(sb: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error, count } = await sb.from("entries").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  check(error);
  if (!count) throw new HttpError(404, "지울 수 있는 조각이 없어요");
}

/**
 * Changes a draft entry's text; its day and time stay as written. RLS hides entries of a closed day
 * (and other users' entries) from updates, so those count as not found, like removeEntry.
 */
export async function updateEntry(sb: SupabaseClient, userId: string, id: string, text: string): Promise<void> {
  const { error, count } = await sb
    .from("entries")
    .update({ body: text }, { count: "exact" })
    .eq("id", id)
    .eq("user_id", userId);
  check(error);
  if (!count) throw new HttpError(404, "고칠 수 있는 조각이 없어요");
}

export async function saveArtwork(
  sb: SupabaseClient,
  userId: string,
  a: { date: string; scene: Scene; style: StyleId; summary: string; tags: string[]; mood?: Mood; songQuery?: string; imagePath?: string | null },
): Promise<void> {
  const { error } = await sb.from("daily_artworks").insert({
    mood: a.mood ?? null,
    song_query: a.songQuery?.trim() || null, // private: only the song route reads it
    image_path: a.imagePath ?? null, // checked by the route (own folder, this day) and by the DB
    user_id: userId,
    day: a.date,
    style: a.style,
    scene: a.scene,
    summary: a.summary,
    tags: a.tags,
  });
  check(error, {
    [UNIQUE_VIOLATION]: new HttpError(409, "이날은 이미 그림이 있어요"),
    [CHECK_VIOLATION]: new HttpError(400, "그림 정보가 너무 길거나 올바르지 않아요"),
  });
}

/**
 * "다시 그리기": replaces the day's picture with a new one in one transaction
 * (redraw_artwork in schema.sql). The day stays closed and the picture keeps its exhibition spot.
 */
export async function redrawArtwork(
  sb: SupabaseClient,
  userId: string,
  a: { date: string; scene: Scene; style: StyleId; summary: string; tags: string[]; imagePath?: string | null },
): Promise<void> {
  const { data: oldPath, error } = await sb.rpc("redraw_artwork", {
    p_day: a.date,
    p_style: a.style,
    p_scene: a.scene,
    p_summary: a.summary,
    p_tags: a.tags,
    p_image_path: a.imagePath ?? null,
  });
  if (error?.code === "PGRST202") {
    // Function not found: supabase/schema.sql has not been re-run since this change.
    console.error("[artwork] redraw_artwork missing: run supabase/schema.sql in the Supabase SQL Editor");
  }
  check(error, {
    [NO_DATA_FOUND]: new HttpError(404, "이날은 그림이 없어요"),
    [CHECK_VIOLATION]: new HttpError(400, "그림 정보가 너무 길거나 올바르지 않아요"),
  });
  // The old file is gone from the DB now; delete it too (best effort, never fails the redraw).
  if (typeof oldPath === "string" && oldPath !== a.imagePath) await removeImage(sb, oldPath);
  debugLog("artwork", "redrawn", { userId, date: a.date, style: a.style, scene: a.scene, image: !!a.imagePath });
}

/** Updates the user's exhibition. `dates` replaces the hung pictures, in order. */
export async function updateExhibition(
  sb: SupabaseClient,
  userId: string,
  patch: { isPublic?: boolean; dates?: string[] },
): Promise<void> {
  if (patch.isPublic !== undefined) {
    const { error, count } = await sb
      .from("exhibitions")
      .update({ is_public: patch.isPublic }, { count: "exact" })
      .eq("user_id", userId);
    check(error);
    if (!count) throw new HttpError(404, "전시회가 없어요");
  }
  if (patch.dates) {
    // One transaction in Postgres (set_exhibition_items in schema.sql).
    const { error } = await sb.rpc("set_exhibition_items", { p_dates: patch.dates });
    check(error, {
      P0002: new HttpError(404, "전시회가 없어요"),
      "22023": new HttpError(400, "그림이 없는 날짜예요"),
    });
  }
}
