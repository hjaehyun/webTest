import assert from "node:assert/strict";
import { test } from "node:test";
import { artworkInputError } from "./validate.ts";

const base = { scene: "rain", style: "water", summary: "비 오는 창가", tags: ["비"], mood: "calm" };

test("artworkInputError: songQuery is optional and must be safe", () => {
  assert.equal(artworkInputError(base), null);
  assert.equal(artworkInputError({ ...base, songQuery: "비 오는 밤 잔잔한 어쿠스틱" }), null);
  assert.equal(artworkInputError({ ...base, songQuery: null }), null);
  assert.equal(artworkInputError({ ...base, songQuery: "민지 010-1234" }), "songQuery가 올바르지 않아요");
  assert.equal(artworkInputError({ ...base, songQuery: "가".repeat(41) }), "songQuery가 올바르지 않아요");
  assert.equal(artworkInputError({ ...base, songQuery: 3 }), "songQuery가 올바르지 않아요");
});
