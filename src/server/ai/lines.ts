// The day's fragments as the text AI reads them. Pure (relative .ts imports) so node --test runs it.

import type { Entry } from "@/lib/types";
import { weatherWord } from "../weather/core.ts";

/** "오전 9:12 (비, 12℃) 조각" lines in Asia/Seoul time, oldest first; no brackets when there is no weather. */
export function entryLines(entries: Entry[]): string {
  return [...entries]
    .sort((a, b) => (a.at < b.at ? -1 : 1))
    .map((e) => `${kstClock(e.at)}${e.weather ? ` (${weatherWord(e.weather)})` : ""} ${e.text}`)
    .join("\n");
}

/** "오후 4:05" in Asia/Seoul. Built by hand: Intl's Korean output depends on the runtime's ICU data. */
function kstClock(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  const h = d.getUTCHours();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
