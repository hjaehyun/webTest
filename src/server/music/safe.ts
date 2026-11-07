// Searching is optional: the pool (and the widened key) can still answer. So a search never fails
// the song request: any error, or no answer within the time limit, becomes "no new songs".
// Pure (type-only imports) so node --test runs it.

import type { MusicProvider, SongHit } from "./types";

const TIMEOUT_MS = 5000; // well inside the serverless function limit

export async function safeSearch(
  provider: MusicProvider,
  query: string,
  warn: (...a: unknown[]) => void = console.warn,
  timeoutMs = TIMEOUT_MS,
): Promise<SongHit[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${provider.name}: no answer in ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([provider.search(query), timeout]);
  } catch (err) {
    warn("[song] search skipped:", err instanceof Error ? err.message : String(err));
    return [];
  } finally {
    clearTimeout(timer);
  }
}
