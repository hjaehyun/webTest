// Image drawing order on top of runWithFallback (specs/haru-image-ai.spl rev 3).
// A content-filter refusal ("Input prompt contains NSFW content", HTTP 400) is about this prompt and this
// model's filter, not a broken request: Workers AI's FLUX filters flag ordinary diary scenes now and then
// (seen 2026-11-08). So it moves to the next model instead of stopping, and if every model refuses, the
// server's own plain scene prompt gets one more pass before the SVG placeholder.
// Pure (relative .ts imports only) so node --test runs it.

import { ModelHttpError, runWithFallback } from "./fallback.ts";

export function isPromptRejected(err: unknown): boolean {
  return err instanceof ModelHttpError && err.status === 400 && /nsfw|safety|unsafe content|content polic/i.test(err.message);
}

const REJECTED = 422; // not one of runWithFallback's stop codes, so the next model is tried

export async function drawWithRetry(opts: {
  models: string[];
  prompt: string;
  safePrompt: string;
  call: (model: string, prompt: string, signal: AbortSignal) => Promise<unknown>;
  check: (raw: unknown) => Uint8Array | null;
  timeoutMs: number;
  warn?: (...a: unknown[]) => void;
}): Promise<{ image: Uint8Array | null; model: string | null; usedSafePrompt: boolean }> {
  let rejected = false;
  const pass = (prompt: string) =>
    runWithFallback<Uint8Array | null>({
      models: opts.models,
      call: async (model, signal) => {
        try {
          return await opts.call(model, prompt, signal);
        } catch (err) {
          if (!isPromptRejected(err)) throw err;
          rejected = true;
          throw new ModelHttpError(REJECTED, `prompt refused by the content filter: ${(err as Error).message}`);
        }
      },
      check: opts.check,
      fallback: async () => null,
      timeoutMs: opts.timeoutMs,
      warn: opts.warn,
    });

  const first = await pass(opts.prompt);
  if (first.value || !rejected || opts.safePrompt === opts.prompt) {
    return { image: first.value, model: first.model, usedSafePrompt: false };
  }
  (opts.warn ?? console.warn)("[ai] every image model refused the prompt; retrying with the plain scene prompt");
  const second = await pass(opts.safePrompt);
  return { image: second.value, model: second.model, usedSafePrompt: true };
}
