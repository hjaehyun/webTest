// Provider contracts. Each AI vendor implements one or both; routes only see these.

import type { CurationInput, CurationText, DaySummary, Entry, Scene, StyleId } from "@/lib/types";

/** What an image provider returns: the scene (placeholder art) and, when it really drew, the image bytes. */
export type ImageResult = { scene: Scene; image: Uint8Array | null };

export interface TextProvider {
  readonly name: string;
  summarizeDay(entries: Entry[]): Promise<DaySummary>;
  writeCuration(input: CurationInput): Promise<CurationText>;
}

export interface ImageProvider {
  readonly name: string;
  draw(summary: DaySummary, style: StyleId): Promise<ImageResult>;
}

/** Thrown by stub providers so routes can answer 501 instead of 500. */
export class NotConfiguredError extends Error {
  constructor(provider: string, detail: string) {
    super(`${provider}: ${detail}`);
    this.name = "NotConfiguredError";
  }
}
