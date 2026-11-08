import assert from "node:assert/strict";
import { test } from "node:test";
import { buildImagePrompt, isSafeImagePrompt, newImagePath, isOwnImagePath, parseImageModels, checkImage } from "./image.ts";

test("isSafeImagePrompt", () => {
  assert.ok(isSafeImagePrompt("a brown cat napping on a sunny sidewalk"));
  assert.ok(!isSafeImagePrompt(""));
  assert.ok(!isSafeImagePrompt("a".repeat(601)));
  assert.ok(!isSafeImagePrompt("call 010 1234"));
  assert.ok(!isSafeImagePrompt("see https://x.y"));
  assert.ok(!isSafeImagePrompt("me@mail.com"));
  assert.ok(!isSafeImagePrompt(5));
});

test("buildImagePrompt: AI prompt + style phrase, scene default when absent", () => {
  const p = buildImagePrompt({ imagePrompt: "a brown cat on a sunny sidewalk", scene: "cat" }, "water");
  assert.match(p, /^a brown cat on a sunny sidewalk/);
  assert.match(p, /watercolor/);
  assert.match(p, /no text/);
  const d = buildImagePrompt({ scene: "rain" }, "crayon");
  assert.match(d, /rain/);
  assert.match(d, /crayon/);
  for (const style of ["water", "pencil", "crayon", "story"] as const) assert.ok(buildImagePrompt({ scene: "day" }, style).length <= 2048);
});

test("parseImageModels: optional format prefix, default json", () => {
  assert.deepEqual(parseImageModels("json:@cf/a/one, multipart:@cf/b/two,@cf/c/three"), [
    { model: "@cf/a/one", format: "json" },
    { model: "@cf/b/two", format: "multipart" },
    { model: "@cf/c/three", format: "json" },
  ]);
  assert.deepEqual(parseImageModels(""), []);
  assert.deepEqual(parseImageModels(undefined), []);
});

const uid = "0f8fad5b-d9cb-469f-a165-70867728950e";
const other = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

test("newImagePath + isOwnImagePath", () => {
  const p = newImagePath(uid, "2026-11-08");
  assert.match(p, /^0f8fad5b-d9cb-469f-a165-70867728950e\/2026-11-08-[A-Za-z0-9]{32}\.jpg$/);
  assert.notEqual(p, newImagePath(uid, "2026-11-08"));
  assert.ok(isOwnImagePath(p, uid, "2026-11-08"));
  assert.ok(!isOwnImagePath(p, other, "2026-11-08")); // someone else's folder
  assert.ok(!isOwnImagePath(p, uid, "2026-11-07")); // another day
  assert.ok(!isOwnImagePath(`${uid}/../${other}/2026-11-08-${"a".repeat(32)}.jpg`, uid, "2026-11-08"));
  assert.ok(!isOwnImagePath("https://evil.example/x.jpg", uid, "2026-11-08"));
  assert.ok(!isOwnImagePath(42, uid, "2026-11-08"));
});

test("checkImage: base64 JPEG/PNG only, size capped", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64");
  assert.equal(checkImage({ result: { image: jpeg } })?.[0], 0xff);
  assert.equal(checkImage({ result: { image: png } })?.[0], 0x89);
  assert.equal(checkImage({ result: { image: Buffer.from("hello").toString("base64") } }), null);
  assert.equal(checkImage({ result: {} }), null);
  assert.equal(checkImage(null), null);
  const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024)]).toString("base64");
  assert.equal(checkImage({ result: { image: huge } }), null);
});
