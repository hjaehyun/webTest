// Picks the music search vendor from env MUSIC_PROVIDER: mock (default) | youtube.

import { mockMusic } from "./mock";
import type { MusicProvider } from "./types";
import { youtubeMusic } from "./youtube";

export function music(): MusicProvider {
  return process.env.MUSIC_PROVIDER === "youtube" ? youtubeMusic : mockMusic;
}

export { MusicQuotaError } from "./types";
export type { MusicProvider, SongHit } from "./types";
