// Read of a public exhibition for anyone, signed in or not. The client passed in has no
// session (anon), so the public RLS policies in supabase/schema.sql decide what comes back:
// a private exhibition simply isn't found. Entries are never selected.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicArtwork, PublicExhibition, Scene } from "@/lib/types";

type ItemRow = {
  position: number;
  note: string | null;
  daily_artworks: { day: string; scene: string; image_url: string | null; summary: string; status: string } | null;
};

/** The exhibition, or null when it is private or doesn't exist (callers answer 404 either way). */
export async function loadPublicExhibition(sb: SupabaseClient, id: string): Promise<PublicExhibition | null> {
  const exRes = await sb
    .from("exhibitions")
    .select("id, user_id, title, description")
    .eq("id", id)
    .eq("is_public", true) // RLS already hides private ones; this keeps the intent obvious
    .maybeSingle();
  if (exRes.error) throw new Error(`${exRes.error.code} ${exRes.error.message}`);
  const ex = exRes.data;
  if (!ex) return null;

  const [profileRes, itemRes] = await Promise.all([
    sb.from("profiles").select("nick").eq("user_id", ex.user_id).maybeSingle(),
    sb
      .from("exhibition_items")
      .select("position, note, daily_artworks(day, scene, image_url, summary, status)")
      .eq("exhibition_id", ex.id)
      .order("position"),
  ]);
  if (profileRes.error) throw new Error(`${profileRes.error.code} ${profileRes.error.message}`);
  if (itemRes.error) throw new Error(`${itemRes.error.code} ${itemRes.error.message}`);

  const items: PublicArtwork[] = [];
  for (const r of (itemRes.data ?? []) as unknown as ItemRow[]) {
    const a = r.daily_artworks;
    if (!a || a.status !== "done") continue; // hidden by RLS or still drawing
    items.push({ date: a.day, scene: a.scene as Scene, imageUrl: a.image_url, summary: a.summary, note: r.note });
  }

  return { id: ex.id, title: ex.title, desc: ex.description, ownerNick: profileRes.data?.nick ?? null, items };
}
