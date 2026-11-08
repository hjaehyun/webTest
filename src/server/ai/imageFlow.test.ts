import assert from "node:assert/strict";
import { test } from "node:test";
import { ModelHttpError } from "./fallback.ts";
import { drawWithRetry, isPromptRejected } from "./imageFlow.ts";

const NSFW = () => new ModelHttpError(400, "AiError: AiError: Input prompt contains NSFW content. (75eed5f1)");
const IMG = new Uint8Array([0xff, 0xd8, 0xff, 1]);
const quiet = () => {};

test("isPromptRejected: content-filter 400 only", () => {
  assert.ok(isPromptRejected(NSFW()));
  assert.ok(!isPromptRejected(new ModelHttpError(400, "bad input: steps")));
  assert.ok(!isPromptRejected(new ModelHttpError(401, "NSFW")));
  assert.ok(!isPromptRejected(new Error("NSFW")));
});

test("a content-filter refusal moves to the next model (not straight to SVG)", async () => {
  const tried: string[] = [];
  const r = await drawWithRetry({
    models: ["schnell", "klein"],
    prompt: "user prompt",
    safePrompt: "scene default",
    call: async (model, prompt) => {
      tried.push(`${model}:${prompt}`);
      if (model === "schnell") throw NSFW();
      return IMG;
    },
    check: (v) => (v instanceof Uint8Array ? v : null),
    timeoutMs: 1000,
    warn: quiet,
  });
  assert.equal(r.image, IMG);
  assert.equal(r.model, "klein");
  assert.deepEqual(tried, ["schnell:user prompt", "klein:user prompt"]);
});

test("every model refuses the prompt -> one more pass with the safe scene prompt", async () => {
  const tried: string[] = [];
  const r = await drawWithRetry({
    models: ["schnell", "klein"],
    prompt: "user prompt",
    safePrompt: "scene default",
    call: async (model, prompt) => {
      tried.push(`${model}:${prompt}`);
      if (prompt === "user prompt") throw NSFW();
      return IMG;
    },
    check: (v) => (v instanceof Uint8Array ? v : null),
    timeoutMs: 1000,
    warn: quiet,
  });
  assert.equal(r.image, IMG);
  assert.equal(r.usedSafePrompt, true);
  assert.deepEqual(tried, ["schnell:user prompt", "klein:user prompt", "schnell:scene default"]);
});

test("no safe retry when the failure wasn't a content refusal (e.g. bad key) -> SVG", async () => {
  const tried: string[] = [];
  const r = await drawWithRetry({
    models: ["schnell", "klein"],
    prompt: "user prompt",
    safePrompt: "scene default",
    call: async (model, prompt) => {
      tried.push(`${model}:${prompt}`);
      throw new ModelHttpError(401, "bad token");
    },
    check: (v) => (v instanceof Uint8Array ? v : null),
    timeoutMs: 1000,
    warn: quiet,
  });
  assert.equal(r.image, null);
  assert.deepEqual(tried, ["schnell:user prompt"]);
});

test("safe prompt also refused -> SVG (null), no endless retry", async () => {
  let calls = 0;
  const r = await drawWithRetry({
    models: ["schnell", "klein"],
    prompt: "user prompt",
    safePrompt: "scene default",
    call: async () => {
      calls++;
      throw NSFW();
    },
    check: (v) => (v instanceof Uint8Array ? v : null),
    timeoutMs: 1000,
    warn: quiet,
  });
  assert.equal(r.image, null);
  assert.equal(calls, 4); // 2 models x (user prompt, safe prompt)
});

test("prompt already was the safe scene prompt -> no second identical pass", async () => {
  let calls = 0;
  const r = await drawWithRetry({
    models: ["schnell", "klein"],
    prompt: "scene default",
    safePrompt: "scene default",
    call: async () => {
      calls++;
      throw NSFW();
    },
    check: (v) => (v instanceof Uint8Array ? v : null),
    timeoutMs: 1000,
    warn: quiet,
  });
  assert.equal(r.image, null);
  assert.equal(calls, 2);
});
