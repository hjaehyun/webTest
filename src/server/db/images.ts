// Picture files in the private "artworks" bucket (specs/haru-image-ai.spl). There are no public URLs:
// pages get 1-hour signed URLs, made here with the secret key only for paths the caller already read
// through RLS (their own pictures, or pictures hung in a public exhibition).

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../supabase";

export const BUCKET = "artworks";
export const SIGNED_URL_SECONDS = 3600;

/** path -> signed URL for the given paths (nulls and failures are left out). */
export async function signImagePaths(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error) {
    console.warn("[image] signing failed:", error.message);
    return out;
  }
  for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) out.set(d.path, d.signedUrl);
  return out;
}

/** Uploads a drawn picture into the user's own folder (storage RLS checks the folder). False on failure. */
export async function uploadImage(sb: SupabaseClient, path: string, image: Uint8Array): Promise<boolean> {
  const png = image[0] === 0x89;
  const { error } = await sb.storage.from(BUCKET).upload(path, image, { contentType: png ? "image/png" : "image/jpeg", upsert: false });
  if (error) console.warn("[image] upload failed:", error.message);
  return !error;
}

/** Best effort: a leftover file only costs storage, so a failure never fails the caller. */
export async function removeImage(sb: SupabaseClient, path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { error } = await sb.storage.from(BUCKET).remove([path]);
  if (error) console.warn("[image] old file not removed:", error.message);
}

/**
 * Account deletion: removes every file in the user's folder (secret key; the user is about to be gone).
 * Best effort: a failure is logged and the account is still deleted.
 */
export async function removeUserImages(userId: string): Promise<void> {
  const store = supabaseAdmin().storage.from(BUCKET);
  for (;;) {
    const { data, error } = await store.list(userId, { limit: 100 });
    if (error || !data?.length) {
      if (error) console.warn("[image] listing the user's files failed:", error.message);
      return;
    }
    const { error: rmError } = await store.remove(data.map((f) => `${userId}/${f.name}`));
    if (rmError) {
      console.warn("[image] removing the user's files failed:", rmError.message);
      return;
    }
    if (data.length < 100) return;
  }
}
