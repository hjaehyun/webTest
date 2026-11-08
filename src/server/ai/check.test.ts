import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCuration, checkSummary } from "./check.ts";

const good = { summary: "비 오는 창가의 하루", tags: ["비", "창가"], scene: "rain", mood: "calm", songQuery: "비 오는 날 잔잔한 노래" };

test("checkSummary: valid response passes through", () => {
  assert.deepEqual(checkSummary(good), good);
});

test("checkSummary: rejects what the schema can't enforce (maxLength is stripped by the API)", () => {
  assert.equal(checkSummary({ ...good, summary: "a".repeat(501) }), null);
  assert.equal(checkSummary({ ...good, summary: "  " }), null);
  assert.equal(checkSummary({ ...good, tags: Array(11).fill("t") }), null);
  assert.equal(checkSummary({ ...good, tags: ["a".repeat(21)] }), null);
  assert.equal(checkSummary({ ...good, scene: "beach" }), null);
  assert.equal(checkSummary({ ...good, mood: "happy" }), null);
  assert.equal(checkSummary(null), null);
  assert.equal(checkSummary("text"), null);
});

test("checkSummary: an unsafe or missing songQuery is dropped, not fatal", () => {
  assert.deepEqual(checkSummary({ ...good, songQuery: "민지 010 1234" }), { ...good, songQuery: undefined });
  const noQuery = { summary: good.summary, tags: good.tags, scene: good.scene, mood: good.mood };
  assert.deepEqual(checkSummary(noQuery), { ...good, songQuery: undefined });
});

test("checkCuration", () => {
  assert.deepEqual(checkCuration({ headline: "비와 고양이의 한 주", body: "이번 주에는…" }), { headline: "비와 고양이의 한 주", body: "이번 주에는…" });
  assert.equal(checkCuration({ headline: "", body: "x" }), null);
  assert.equal(checkCuration({ headline: "a".repeat(61), body: "x" }), null);
  assert.equal(checkCuration({ headline: "h", body: "b".repeat(601) }), null);
  assert.equal(checkCuration(undefined), null);
});

test("checkSummary: imagePrompt kept when safe, dropped (not fatal) otherwise", () => {
  const withPrompt = { ...good, imagePrompt: "a brown cat on a sunny sidewalk, rainy window in the evening" };
  assert.equal(checkSummary(withPrompt)?.imagePrompt, withPrompt.imagePrompt);
  assert.equal(checkSummary({ ...good, imagePrompt: "call 010-1234" })?.imagePrompt, undefined);
  assert.notEqual(checkSummary({ ...good, imagePrompt: "a".repeat(601) }), null);
});
