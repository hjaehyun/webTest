// Provider contracts. Each AI vendor implements one or both; routes only see these.

import type { CurationInput, CurationText, DaySummary, Drawing, Entry, StyleId } from "@/lib/types";

export interface TextProvider {
  readonly name: string;
  summarizeDay(entries: Entry[]): Promise<DaySummary>;
  writeCuration(input: CurationInput): Promise<CurationText>;
}

export interface ImageProvider {
  readonly name: string;
  draw(summary: DaySummary, style: StyleId): Promise<Drawing>;
}

/** Thrown by stub providers so routes can answer 501 instead of 500. */
export class NotConfiguredError extends Error {
  constructor(provider: string, detail: string) {
    super(`${provider}: ${detail}`);
    this.name = "NotConfiguredError";
  }
}
