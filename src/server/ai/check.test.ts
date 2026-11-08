import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCuration, checkSummary, isHaeyo } from "./check.ts";

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
  assert.deepEqual(checkCuration({ headline: "비와 고양이의 한 주", body: "이번 주에는 비가 많았어요." }), { headline: "비와 고양이의 한 주", body: "이번 주에는 비가 많았어요." });
  assert.equal(checkCuration({ headline: "", body: "좋았어요." }), null);
  assert.equal(checkCuration({ headline: "a".repeat(61), body: "좋았어요." }), null);
  assert.equal(checkCuration({ headline: "h", body: "가".repeat(599) + "요." }), null);
  assert.equal(checkCuration(undefined), null);
});

test("checkSummary: imagePrompt kept when safe, dropped (not fatal) otherwise", () => {
  const withPrompt = { ...good, imagePrompt: "a brown cat on a sunny sidewalk, rainy window in the evening" };
  assert.equal(checkSummary(withPrompt)?.imagePrompt, withPrompt.imagePrompt);
  assert.equal(checkSummary({ ...good, imagePrompt: "call 010-1234" })?.imagePrompt, undefined);
  assert.notEqual(checkSummary({ ...good, imagePrompt: "a".repeat(601) }), null);
});

test("checkCuration: body must be 해요체 in every sentence", () => {
  const h = "비와 고양이의 한 주";
  const ok = (body: string) => checkCuration({ headline: h, body }) !== null;
  assert.ok(ok("이번 주에는 고양이가 자주 보였어요. 비 오는 날도 많았네요! 다음 주도 기대돼요?"));
  assert.ok(ok("햇살 아래 고양이가 있었죠. 조용한 한 주였어요 🍂"));
  assert.ok(!ok("이번 주는 평온한 순간들이 가득했습니다. 바쁜 시간을 보내기도 했네요."));
  assert.ok(!ok("고양이와 비가 함께한 한 주였다. 좋았어요."));
  assert.ok(!ok("마음이 잔잔하게 채워집니다"));
});

test("isHaeyo", () => {
  assert.ok(isHaeyo("좋았어요."));
  assert.ok(isHaeyo("그랬죠… 좋았어요!"));
  assert.ok(!isHaeyo("좋았습니다."));
  assert.ok(!isHaeyo(""));
});
