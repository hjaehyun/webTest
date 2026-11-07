// YouTube Data API v3 search.list. Key: YOUTUBE_API_KEY (server only). Each call uses the
// project's daily search quota, so callers search only when song_pool has too few songs.

import { NotConfiguredError } from "../ai/types";
import { parseSearchResponse } from "./parse";
import { MusicQuotaError, type MusicProvider, type SongHit } from "./types";

const ENDPOINT = "https://www.googleapis.com/youtube/v3/search";

export const youtubeMusic: MusicProvider = {
  name: "youtube",
  async search(query: string): Promise<SongHit[]> {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) throw new NotConfiguredError("youtube", "YOUTUBE_API_KEY is not set (.env.local)");
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "5",
      videoCategoryId: "10", // Music
      videoEmbeddable: "true",
      videoDuration: "medium", // 4-20 minutes: no hour-long playlists
      regionCode: "KR",
      relevanceLanguage: "ko",
      safeSearch: "strict",
      q: query,
      key,
    });
    const res = await fetch(`${ENDPOINT}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (json as { error?: { errors?: { reason?: string }[] } } | null)?.error?.errors?.[0]?.reason;
      if (res.status === 403 && (reason === "quotaExceeded" || reason === "dailyLimitExceeded")) {
        throw new MusicQuotaError(`youtube: ${reason}`);
      }
      throw new Error(`youtube search failed: ${res.status} ${reason ?? ""}`.trim());
    }
    return parseSearchResponse(json);
  },
};
