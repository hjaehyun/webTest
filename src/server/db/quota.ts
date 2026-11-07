// Per-user daily AI call limit. The count lives in public.ai_usage and only the
// consume_ai_quota() function (supabase/schema.sql) can change it, so users can't reset it themselves.
// Limits per day (Asia/Seoul): summarize 20, draw 10, curate 20, song 10 — edit them in schema.sql.

import type { SupabaseClient } from "@supabase/supabase-js";
import { secLog } from "../debug";
import { HttpError } from "../http";

export type AiKind = "summarize" | "draw" | "curate" | "song";

/** Counts one AI call for the signed-in user; throws 429 when today's limit is used up. */
export async function consumeAiQuota(sb: SupabaseClient, userId: string, kind: AiKind): Promise<void> {
  const { data, error } = await sb.rpc("consume_ai_quota", { p_kind: kind });
  if (error) {
    // PGRST202 = function not found: supabase/schema.sql has not been re-run since this change.
    // Always logged (not secLog): every AI call fails until this is fixed.
    console.error("[security] AI quota check failed", {
      kind,
      userId,
      code: error.code,
      message: error.message,
      hint: error.code === "PGRST202" ? "run supabase/schema.sql in the Supabase SQL Editor" : undefined,
    });
    // Fail closed: without the counter we can't tell how much was used.
    throw new HttpError(503, "AI 사용량을 확인하지 못했어요. 잠시 후 다시 해주세요");
  }
  if (data !== true) {
    secLog("AI quota exceeded", { kind, userId });
    throw new HttpError(429, "오늘 AI 사용 횟수를 다 썼어요. 내일 다시 해주세요");
  }
  secLog("AI quota ok", { kind, userId });
}
