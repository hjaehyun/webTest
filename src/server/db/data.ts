// Reads and writes of a user's diary through Supabase. The client passed in acts as the
// signed-in user, so Row Level Security (supabase/schema.sql) decides what each query may touch;
// the user_id filters here only keep results tidy.

import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js";
import type { Artwork, DB, Entry, Profile, Scene, StyleId } from "@/lib/types";
import { HttpError } from "../http";

const DEFAULT_EXHIBITION_TITLE = "나의 전시";

// Postgres error codes we turn into user-facing answers.
const UNIQUE_VIOLATION = "23505";
const RLS_VIOLATION = "42501";

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
    sb.from("entries").select("id, day, written_at, body").eq("user_id", user.id).order("written_at"),
    sb
      .from("daily_artworks")
      .select("day, style, scene, summary, tags")
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

  const artworks: Record<string, Artwork> = {};
  for (const r of artRes.data ?? []) {
    artworks[r.day] = {
      date: r.day,
      scene: r.scene as Scene,
      style: r.style as StyleId,
      summary: r.summary,
      tags: r.tags,
      entries: [],
    };
  }

  // An entry belongs to its day's picture once that day is closed; otherwise it is a draft.
  const drafts: Record<string, Entry[]> = {};
  for (const r of entryRes.data ?? []) {
    const entry: Entry = { id: r.id, at: new Date(r.written_at).toISOString(), text: r.body };
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
    account: { email: user.email ?? "", joinedAt: user.created_at },
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

export async function addEntry(sb: SupabaseClient, userId: string, day: string, e: Entry): Promise<void> {
  const { error } = await sb
    .from("entries")
    .insert({ id: e.id, user_id: userId, day, written_at: e.at, body: e.text });
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

export async function saveArtwork(
  sb: SupabaseClient,
  userId: string,
  a: { date: string; scene: Scene; style: StyleId; summary: string; tags: string[] },
): Promise<void> {
  const { error } = await sb.from("daily_artworks").insert({
    user_id: userId,
    day: a.date,
    style: a.style,
    scene: a.scene,
    summary: a.summary,
    tags: a.tags,
  });
  check(error, { [UNIQUE_VIOLATION]: new HttpError(409, "이날은 이미 그림이 있어요") });
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
