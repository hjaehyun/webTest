import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSearchResponse } from "./parse.ts";

const item = (id: unknown, title: string, channel = "헤이즈 - Topic") => ({
  id: { kind: "youtube#video", videoId: id },
  snippet: { title, channelTitle: channel },
});

test("keeps good items, decodes entities", () => {
  const hits = parseSearchResponse({ items: [item("abcdefghijk", "비도 오고 그래서 &#39;Rain&#39; &amp; more")] });
  assert.deepEqual(hits, [{ videoId: "abcdefghijk", title: "비도 오고 그래서 'Rain' & more", channel: "헤이즈 - Topic" }]);
});

test("drops playlists/compilations by title, keeps remixes", () => {
  for (const t of ["잔잔한 플레이리스트", "1시간 모음", "rainy day mix", "Lofi 3 hours", "비 노래 playlist"])
    assert.equal(parseSearchResponse({ items: [item("abcdefghijk", t)] }).length, 0, t);
  assert.equal(parseSearchResponse({ items: [item("abcdefghijk", "Rain (Remix)")] }).length, 1);
});

test("drops bad ids and missing snippets, keeps the rest", () => {
  const hits = parseSearchResponse({
    items: [item("short", "a"), { id: { videoId: "abcdefghijk" } }, item("ZYXWVUTSRQ_", "ok")],
  });
  assert.deepEqual(
    hits.map((h) => h.videoId),
    ["ZYXWVUTSRQ_"],
  );
});

test("truncates title 200 / channel 100", () => {
  const [h] = parseSearchResponse({ items: [item("abcdefghijk", "가".repeat(250), "나".repeat(150))] });
  assert.equal(h.title.length, 200);
  assert.equal(h.channel.length, 100);
});

test("garbage input -> []", () => {
  assert.deepEqual(parseSearchResponse(null), []);
  assert.deepEqual(parseSearchResponse({ items: "x" }), []);
});

test("hostile entities: single decode pass, no throw, no NUL/surrogates", () => {
  const one = (t: string) => parseSearchResponse({ items: [item("abcdefghijk", t)] })[0]?.title;
  assert.equal(one("Tom&amp;#39;s"), "Tom&#39;s"); // decoded once, not twice
  assert.doesNotThrow(() => one("&amp;#99999999; &#99999999;"));
  assert.equal(one("a&#99999999;b"), "a&#99999999;b"); // out of range stays as text
  assert.equal(one("a&#0;b"), "ab"); // NUL dropped (Postgres text rejects it)
  assert.equal(one("a&#55296;b"), "a&#55296;b"); // lone surrogate stays as text
  assert.equal(one("x&#x41;y"), "xAy");
  assert.equal(one("tab\tand\u0007bell"), "tabandbell");
});
