// Music search contract. Routes only see this; the vendor sits behind MUSIC_PROVIDER.

export type SongHit = { videoId: string; title: string; channel: string };

export interface MusicProvider {
  readonly name: string;
  /** Up to 5 embeddable songs for the query; [] when nothing fits. */
  search(query: string): Promise<SongHit[]>;
}

/** The vendor's daily quota is used up: skip searching and pick from the pool. */
export class MusicQuotaError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "MusicQuotaError";
  }
}
