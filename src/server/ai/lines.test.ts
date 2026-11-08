import assert from "node:assert/strict";
import { test } from "node:test";
import { entryLines } from "./lines.ts";

test("entryLines: KST time, weather in brackets when known, oldest first, no coordinates", () => {
  const lines = entryLines([
    { id: "b", at: "2026-11-08T07:05:00.000Z", text: "아 배고프다", weather: { weather: "rain", tempC: 12 } },
    { id: "a", at: "2026-11-08T00:12:00.000Z", text: "고양이 봤다", weather: null },
  ]);
  assert.equal(lines, "오전 9:12 고양이 봤다\n오후 4:05 (비, 12℃) 아 배고프다");
});
