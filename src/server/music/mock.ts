// Mock music search: five fixed fake songs per query, no network. Default until a YouTube key is set.
// Ids are "MOCK_" + 4 hash chars + 2 digits = 11 characters, so they pass the song_pool check.

import type { MusicProvider, SongHit } from "./types";

/** The UI shows a mock song as text instead of a YouTube player. */
export const isMockVideo = (videoId: string): boolean => videoId.startsWith("MOCK_");

function hash4(s: string): string {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h.toString(36).padStart(4, "0").slice(-4);
}

export const mockMusic: MusicProvider = {
  name: "mock",
  async search(query: string): Promise<SongHit[]> {
    const h = hash4(query);
    return Array.from({ length: 5 }, (_, i) => ({
      videoId: `MOCK_${h}${String(i + 1).padStart(2, "0")}`,
      title: `[모의 곡] ${query} ${i + 1}`,
      channel: "하루조각 모의 채널",
    }));
  },
};
