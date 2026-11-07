import assert from "node:assert/strict";
import { test } from "node:test";
import { safeSearch } from "./safe.ts";

const hit = { videoId: "abcdefghijk", title: "t", channel: "c" };
const ok = { name: "ok", search: async () => [hit] };
const boom = (e: unknown) => ({ name: "boom", search: async () => Promise.reject(e) });

test("returns hits when the provider works", async () => {
  assert.deepEqual(await safeSearch(ok, "q"), [hit]);
});

test("any provider failure -> [] (pool fallback), never throws", async () => {
  for (const e of [new Error("youtube search failed: 500"), new TypeError("fetch failed"), "weird"]) {
    const warnings: unknown[] = [];
    assert.deepEqual(await safeSearch(boom(e), "q", (...a) => warnings.push(a)), []);
    assert.equal(warnings.length, 1);
  }
});

test("a hanging provider times out", async () => {
  const hang = { name: "hang", search: () => new Promise<never>(() => {}) };
  const started = Date.now();
  assert.deepEqual(await safeSearch(hang, "q", () => {}, 50), []);
  assert.ok(Date.now() - started < 1000);
});
