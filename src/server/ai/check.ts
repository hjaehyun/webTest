// Checks what a text AI returned before anyone uses it. Gemini's JSON schema keeps the shape, but
// it drops maxLength, so lengths and lists are checked here with the same limits as the DB (M4).
// Pure (relative .ts imports only) so node --test runs it.

import type { CurationText, DaySummary } from "@/lib/types";
import { isMood, isSafeSongQuery } from "../music/key.ts";
import { AI_LIMITS, isScene, isTagList, isText } from "../validate.ts";
import { isSafeImagePrompt } from "./image.ts";

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);

export const CURATION_LIMITS = { headline: 60, body: 600 } as const;

/** The day's summary, or null when it can't be used (the caller tries the next model). */
export function checkSummary(v: unknown): DaySummary | null {
  const o = rec(v);
  if (!o) return null;
  if (!isText(o.summary, AI_LIMITS.summary) || !isTagList(o.tags) || !isScene(o.scene) || !isMood(o.mood)) return null;
  // A bad search query alone isn't worth another model call: drop it and use the fixed words.
  return {
    summary: o.summary,
    tags: o.tags,
    scene: o.scene,
    mood: o.mood,
    songQuery: isSafeSongQuery(o.songQuery) ? o.songQuery.trim() : undefined,
    // Same for the picture prompt: without it the image AI uses the scene's default words.
    ...(isSafeImagePrompt(o.imagePrompt) ? { imagePrompt: o.imagePrompt.trim() } : {}),
  };
}

/**
 * Every sentence ends in 해요체 (~요, or ~죠). Trailing punctuation, ellipses and emoji are ignored.
 * The curator's voice is one polite-casual tone; a 합니다/한다 sentence makes the answer unusable.
 */
export function isHaeyo(text: string): boolean {
  const sentences = text
    .split(/(?<=[.!?…。])\s+|\n+/)
    .map((s) => s.replace(/[\s.!?…。~"'”’)\]\p{Extended_Pictographic}️]+$/u, ""))
    .filter(Boolean);
  return sentences.length > 0 && sentences.every((s) => /[요죠]$/.test(s));
}

export function checkCuration(v: unknown): CurationText | null {
  const o = rec(v);
  if (!o || !isText(o.headline, CURATION_LIMITS.headline) || !isText(o.body, CURATION_LIMITS.body)) return null;
  if (!isHaeyo(o.body)) return null; // mixed tone -> the caller tries the next model
  return { headline: o.headline, body: o.body };
}
