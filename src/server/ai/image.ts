// Image AI helpers (specs/haru-image-ai.spl): prompt building, model list parsing, storage paths and
// answer checks. Pure (type-only imports) so node --test runs it.

import type { Scene, StyleId } from "@/lib/types";

const PROMPT_MAX = 600; // what the text AI may write (Cloudflare accepts up to 2048 in total)

/** The text AI's English scene prompt: refused if it looks like personal data (digits, @, links). */
export function isSafeImagePrompt(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const p = v.trim();
  return p.length > 0 && p.length <= PROMPT_MAX && !/[0-9@]|https?:|www\./i.test(p);
}

// Fixed style words the server adds; the text AI never decides the style.
const STYLE_PHRASES: Record<StyleId, string> = {
  water: "warm watercolor picture diary illustration, soft edges, gentle washes, paper texture",
  pencil: "colored pencil picture diary sketch, light hatching, soft pastel tones, paper texture",
  crayon: "children's crayon drawing picture diary, bold waxy strokes, bright simple shapes",
  story: "storybook illustration, cozy picture book style, warm light, clean shapes",
};

// Used when there is no AI prompt (mock text AI, or an unsafe prompt was dropped).
const SCENE_DEFAULTS: Record<Scene, string> = {
  day: "an ordinary day at a desk by a window with books and a cup, calm daylight",
  cat: "a cat napping in a warm patch of sunlight on a quiet street",
  rain: "a rainy window with raindrops, a desk inside with a warm lamp",
  park: "a walk in a park with trees and fallen leaves, soft afternoon light",
  cafe: "a cozy cafe table with a latte and a notebook, warm interior light",
  night: "a quiet night view from a window with a moon and small city lights",
};

const ALWAYS = "one single scene, no text, no letters, no words, no watermark";

export function buildImagePrompt(s: { imagePrompt?: string; scene: Scene }, style: StyleId): string {
  const subject = isSafeImagePrompt(s.imagePrompt) ? s.imagePrompt.trim() : SCENE_DEFAULTS[s.scene];
  return `${subject}. ${STYLE_PHRASES[style]}, ${ALWAYS}`;
}

export type ImageModel = { model: string; format: "json" | "multipart" };

/** env CLOUDFLARE_IMAGE_MODELS: "json:@cf/a,multipart:@cf/b,@cf/c" (no prefix = json). */
export function parseImageModels(env: string | undefined): ImageModel[] {
  return (env ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(json|multipart):(.+)$/.exec(s);
      return m ? { model: m[2].trim(), format: m[1] as ImageModel["format"] } : { model: s, format: "json" as const };
    });
}

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** "{userId}/{date}-{32 random letters}.jpg" in the private artworks bucket. */
export function newImagePath(userId: string, date: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const rand = Array.from(bytes, (b) => ALNUM[b % ALNUM.length]).join("");
  return `${userId}/${date}-${rand}.jpg`;
}

/** A path this user may attach to this day's picture (same rule as the DB check). */
export function isOwnImagePath(v: unknown, userId: string, date: string): v is string {
  if (typeof v !== "string") return false;
  const m = /^([0-9a-f-]{36})\/(\d{4}-\d{2}-\d{2})-[A-Za-z0-9]{32}\.jpg$/.exec(v);
  return !!m && m[1] === userId && m[2] === date;
}

const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** Image bytes from a Workers AI answer ({ result: { image: base64 } }), or null if it isn't a JPEG/PNG. */
export function checkImage(json: unknown): Uint8Array | null {
  const b64 = (json as { result?: { image?: unknown } } | null)?.result?.image;
  if (typeof b64 !== "string" || b64.length === 0) return null;
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) return null;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return jpeg || png ? new Uint8Array(bytes) : null;
}
