// Tries the configured models in order and falls back to mock, so a free-tier limit or an outage
// never fails closing a day. Rules (specs/haru-gemini-text-ai.spl @BRANCH):
//   429, 5xx, 404 (model gone), network error, time limit, unusable answer -> next model
//   400, 401, 403 (bad request or key): every model would fail the same way -> mock now
// Pure (no imports) so node --test runs it.

/** A non-2xx answer from a model API. */
export class ModelHttpError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ModelHttpError";
    this.status = status;
  }
}

const STOP = new Set([400, 401, 403]);

export type FallbackResult<T> = { value: T; source: "ai" | "fallback"; model: string | null };

export async function runWithFallback<T>(opts: {
  models: string[];
  call: (model: string, signal: AbortSignal) => Promise<unknown>;
  check: (raw: unknown) => T | null;
  fallback: () => Promise<T>;
  timeoutMs: number;
  warn?: (...a: unknown[]) => void;
}): Promise<FallbackResult<T>> {
  const warn = opts.warn ?? console.warn;
  for (const model of opts.models) {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new Error(`no answer in ${opts.timeoutMs}ms`));
      }, opts.timeoutMs);
    });
    try {
      const value = opts.check(await Promise.race([opts.call(model, ctrl.signal), timeout]));
      if (value !== null) return { value, source: "ai", model };
      warn(`[ai] ${model}: unusable answer, trying the next model`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof ModelHttpError && STOP.has(err.status)) {
        warn(`[ai] ${model}: ${err.status} ${msg}; using mock (other models would fail the same way)`);
        break;
      }
      warn(`[ai] ${model}: ${msg}; trying the next model`);
    } finally {
      clearTimeout(timer);
    }
  }
  return { value: await opts.fallback(), source: "fallback", model: null };
}
