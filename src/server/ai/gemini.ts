// Google Gemini text provider (free tier), specs/haru-gemini-text-ai.spl.
//
// Each feature has its own model list so their free-tier limits add up (limits are per model):
//   GEMINI_MODELS_SUMMARIZE  e.g. "<flash>,<flash-lite>"   scene summary + mood + songQuery
//   GEMINI_MODELS_CURATE     e.g. "<flash>,<flash-lite>"   curator commentary
// Model names live only in env (.env.example has the defaults). After the last model, mock answers,
// so a limit or outage never fails closing a day. Key: GEMINI_API_KEY (server only).
// REST Interactions API through fetch; store:false keeps the conversation off Google's servers.
// Free tier: Google may use inputs to improve its products, so the app tells users (sign-up, guide).

import type { CurationInput, CurationText, DaySummary, Entry } from "@/lib/types";
import { MOODS } from "../music/key";
import { SCENES } from "../validate";
import { checkCuration, checkSummary } from "./check";
import { ModelHttpError, runWithFallback } from "./fallback";
import { entryLines } from "./lines";
import { mockText } from "./mock";
import type { TextProvider } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const API_REVISION = "2026-05-20";
// Free-tier Flash measured 37s and >45s (2026-11-08); 60s per model, then the next one (SPL rev 3).
// Routes allow 90s (maxDuration) so the fallback model still has time to answer.
export const TIMEOUT_MS = 60_000;

const models = (envName: string): string[] =>
  (process.env[envName] ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" }, maxItems: 10 },
    scene: { type: "string", enum: SCENES },
    mood: { type: "string", enum: MOODS },
    songQuery: { type: "string" },
    imagePrompt: { type: "string" },
  },
  required: ["summary", "tags", "scene", "mood", "songQuery", "imagePrompt"],
};

const CURATION_SCHEMA = {
  type: "object",
  properties: { headline: { type: "string" }, body: { type: "string" } },
  required: ["headline", "body"],
};

const SUMMARY_SYSTEM = [
  "너는 그림일기 앱 '하루조각'의 장면 정리 담당이다. 사용자가 하루 동안 남긴 짧은 조각글을 받아 그림 한 장으로 그릴 장면을 정리한다.",
  "- summary: 그림으로 그릴 수 있는 한 문단(300자 이내). 서로 다른 순간은 시간 순서대로 한 그림 안에 조화롭게 담는다. 그림체 이야기는 쓰지 않는다.",
  "- tags: 자주 나온 대상이나 순간을 짧은 명사로 1~5개(각 10자 이내).",
  "- scene: 목록에서 가장 가까운 배경 하나.",
  "- mood: 목록에서 그날 전체 분위기에 가장 가까운 하나.",
  "- songQuery: 그날에 어울리는 노래를 YouTube에서 찾을 검색어(25자 이내). 장르·분위기·날씨·시간대·상황 단어만 쓴다. 사람 이름, 장소, 학교, 회사, 숫자, 조각글 문장을 넣지 않는다. 예: '비 오는 밤 잔잔한 어쿠스틱'.",
  "- imagePrompt: 그림 AI에 보낼 영어 프롬프트 한 문단(400자 이내). 한 장의 그림으로 그릴 대상·배경·빛·분위기 순서로 쓴다. 시간 순 요소는 한 화면에 자연스럽게 배치하고, 서로 어울리지 않는 날씨(햇살과 비 등)는 같은 하늘에 섞지 말고 창 안팎이나 왼쪽·오른쪽처럼 나눠 둔다. 사람은 작게 또는 뒷모습으로. 사람 이름, 실제 장소명, 숫자, 그림 속 글자는 넣지 않는다. 그림체(수채화 등)는 쓰지 않는다.",
  "- 조각글 앞 괄호의 날씨(예: '(비, 12℃)')는 그 시각의 실제 날씨다. 장면 배경으로 자연스럽게 살리고(비 오는 오후면 창밖의 비, 맑은 아침이면 햇살), imagePrompt와 songQuery에도 반영한다. 기온 숫자는 그림 안에 쓰지 않는다. 괄호가 없는 시각의 날씨는 지어내지 않는다.",
  "조각글에 없는 사실을 지어내지 않는다.",
].join("\n");

const CURATION_SYSTEM = [
  "너는 그림일기 앱 '하루조각'의 큐레이터다. 한 기간 동안 모인 그림들의 장면 요약과 자주 나온 태그를 받아 전시 해설을 쓴다.",
  "- headline: 그 기간을 한 줄로 부르는 제목(40자 이내).",
  "- body: 2~4문장(400자 이내). 주어진 요약과 태그에 있는 내용만 쓴다.",
  "- 말투: body의 모든 문장을 해요체로 끝낸다(~어요, ~네요, ~죠). ~습니다, ~합니다, ~이다, ~했다처럼 끝내지 않는다. 한 문장이라도 어기면 답은 버려진다.",
  "  좋은 예: '비 오는 날이 많았어요. 고양이가 자주 보였네요.' / 나쁜 예: '비 오는 날이 많았습니다. 고양이가 자주 보였다.'",
].join("\n");

/** One Interactions API call; returns the parsed JSON the model wrote. */
async function interact(model: string, system: string, input: string, schema: object, signal: AbortSignal): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ModelHttpError(401, "GEMINI_API_KEY is not set");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key, "Api-Revision": API_REVISION },
    body: JSON.stringify({
      model,
      input,
      system_instruction: system,
      response_format: { type: "text", mime_type: "application/json", schema },
      generation_config: { max_output_tokens: 1024 },
      store: false,
    }),
    signal,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
  } | null;
  if (!res.ok) throw new ModelHttpError(res.status, (json?.error?.message ?? "request failed").slice(0, 200));
  const out = (json?.steps ?? []).filter((s) => s.type === "model_output").at(-1);
  const text = (out?.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
  if (!text) throw new Error("no text in the answer");
  return JSON.parse(text); // a parse error counts as an unusable answer -> next model
}

export const geminiText: TextProvider = {
  name: "gemini",

  async summarizeDay(entries: Entry[]): Promise<DaySummary> {
    const r = await runWithFallback<DaySummary>({
      models: models("GEMINI_MODELS_SUMMARIZE"),
      call: (model, signal) => interact(model, SUMMARY_SYSTEM, `오늘의 조각글:\n${entryLines(entries)}`, SUMMARY_SCHEMA, signal),
      check: checkSummary,
      fallback: () => mockText.summarizeDay(entries),
      timeoutMs: TIMEOUT_MS,
    });
    if (r.model) console.info(`[ai] summarize answered by ${r.model}`);
    return { ...r.value, source: r.source };
  },

  async writeCuration(input: CurationInput): Promise<CurationText> {
    const r = await runWithFallback<CurationText>({
      models: models("GEMINI_MODELS_CURATE"),
      call: (model, signal) => interact(model, CURATION_SYSTEM, JSON.stringify(input), CURATION_SCHEMA, signal),
      check: checkCuration,
      fallback: () => mockText.writeCuration(input),
      timeoutMs: TIMEOUT_MS,
    });
    if (r.model) console.info(`[ai] curate answered by ${r.model}`);
    return r.value;
  },
};
