// Turns a YouTube search.list response into song candidates. Pure (no imports) so node --test runs it.

import type { SongHit } from "./types";

// Hour-long compilations aren't "a song for today". \bmix\b keeps remixes.
const NOT_A_SONG = /playlist|플레이리스트|모음|\bmix\b|1시간|hours/i;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// Same limits as the song_pool check constraints.
const TITLE_MAX = 200;
const CHANNEL_MAX = 100;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/**
 * YouTube returns titles HTML-escaped (&#39;, &amp;). Uploaders control titles, so this is one pass
 * (no double decoding of "&amp;#39;"), never throws, and drops control characters Postgres or the UI
 * can't take. A numeric entity outside Unicode or naming a lone surrogate stays as plain text.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&(?:(amp|lt|gt|quot|apos)|#(\d{1,8})|#x([0-9a-f]{1,8}));/gi, (raw, name?: string, dec?: string, hex?: string) => {
      if (name) return NAMED[name.toLowerCase()];
      const cp = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
      if (cp === 0) return "";
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return raw;
      return String.fromCodePoint(cp);
    })
    .replace(/[\u0000-\u001f\u007f]/g, "");
}

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);

/** Items that look like one embeddable song; anything malformed is skipped, never thrown on. */
export function parseSearchResponse(json: unknown): SongHit[] {
  const items = rec(json)?.items;
  if (!Array.isArray(items)) return [];
  const hits: SongHit[] = [];
  for (const it of items) {
    const videoId = rec(rec(it)?.id)?.videoId;
    const snippet = rec(rec(it)?.snippet);
    if (typeof videoId !== "string" || !VIDEO_ID.test(videoId) || !snippet) continue;
    if (typeof snippet.title !== "string" || typeof snippet.channelTitle !== "string") continue;
    const title = decodeEntities(snippet.title).trim();
    // NFKC folds styled letters (𝐏𝐋𝐀𝐘𝐋𝐈𝐒𝐓, ｍｉｘ) to plain ones for the filter; the title is stored as uploaded.
    if (!title || NOT_A_SONG.test(title.normalize("NFKC"))) continue;
    hits.push({
      videoId,
      title: [...title].slice(0, TITLE_MAX).join(""),
      channel: [...decodeEntities(snippet.channelTitle).trim()].slice(0, CHANNEL_MAX).join("") || "YouTube",
    });
  }
  return hits;
}
