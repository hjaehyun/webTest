// Cloudflare Workers AI image provider (FLUX, free tier), specs/haru-image-ai.spl.
//
//   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN   server only
//   CLOUDFLARE_IMAGE_MODELS  "json:<model>,multipart:<model>"  tried in order; the SVG placeholder after the last
// Models differ in request format (some take JSON, others multipart form data), so each entry says which.
// Model names live only in env (.env.example has the defaults). Same fallback rules as the text AI.

import type { DaySummary, StyleId } from "@/lib/types";
import { ModelHttpError, runWithFallback } from "./fallback";
import { type ImageModel, buildImagePrompt, checkImage, parseImageModels } from "./image";
import type { ImageProvider, ImageResult } from "./types";

const TIMEOUT_MS = 45_000;
const SIZE = "768"; // for models that take a size: smaller files (~0.5MB) in the 1GB free Storage
const STEPS = "4";

async function run(m: ImageModel, prompt: string, signal: AbortSignal): Promise<unknown> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new ModelHttpError(401, "Cloudflare account or token is not set");
  let body: BodyInit;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (m.format === "multipart") {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("width", SIZE);
    form.append("height", SIZE);
    form.append("steps", STEPS);
    body = form; // fetch sets the multipart boundary header
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ prompt, steps: Number(STEPS) });
  }
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${m.model}`, {
    method: "POST",
    headers,
    body,
    signal,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null;
  if (!res.ok) throw new ModelHttpError(res.status, (json?.errors?.[0]?.message ?? "request failed").slice(0, 200));
  return json;
}

export const cloudflareImage: ImageProvider = {
  name: "cloudflare",

  async draw(summary: DaySummary, style: StyleId): Promise<ImageResult> {
    const prompt = buildImagePrompt(summary, style);
    const models = parseImageModels(process.env.CLOUDFLARE_IMAGE_MODELS);
    const r = await runWithFallback<Uint8Array | null>({
      models: models.map((m) => m.model),
      call: (model, signal) => run(models.find((m) => m.model === model)!, prompt, signal),
      check: checkImage,
      fallback: async () => null, // the scene's SVG placeholder
      timeoutMs: TIMEOUT_MS,
    });
    if (r.model) console.info(`[ai] image drawn by ${r.model}`);
    return { scene: summary.scene, image: r.value };
  },
};
