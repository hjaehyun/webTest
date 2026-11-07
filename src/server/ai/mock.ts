// Mock provider: keyword rules and canned text. Default until an AI vendor is chosen.

import type { CurationInput, CurationText, DaySummary, Drawing, Entry, Mood, Scene } from "@/lib/types";
import type { ImageProvider, TextProvider } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RULES: { re: RegExp; scene: Scene; tag: string; mood: Mood }[] = [
  { re: /고양이|냥이|강아지/, scene: "cat", tag: "동물", mood: "cozy" },
  { re: /비 |비가|비오|비 오|우산|장마/, scene: "rain", tag: "비", mood: "calm" },
  { re: /커피|카페|라떼|차 한/, scene: "cafe", tag: "커피", mood: "cozy" },
  { re: /밤|야경|달|새벽|잠/, scene: "night", tag: "밤", mood: "calm" },
  { re: /공원|산책|나무|단풍|걷/, scene: "park", tag: "산책", mood: "upbeat" },
  { re: /과제|시험|공부|수업|교수/, scene: "day", tag: "공부", mood: "busy" },
  { re: /배고|밥|먹|간식|과자/, scene: "cafe", tag: "먹을 것", mood: "lazy" },
];

/** Picks the particle form by whether the word ends in a final consonant (받침). */
function josa(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return withoutFinal;
  return code % 28 === 0 ? withoutFinal : withFinal;
}

export const mockText: TextProvider = {
  name: "mock",

  async summarizeDay(entries: Entry[]): Promise<DaySummary> {
    await sleep(1600);
    const text = entries.map((e) => e.text).join(" ");
    const hits = RULES.filter((r) => r.re.test(text));
    const tags = Array.from(new Set(hits.map((h) => h.tag)));
    const scene = hits[0]?.scene ?? "day";
    const mood: Mood = hits[0]?.mood ?? "calm";
    const summary =
      "[모의 요약] " +
      entries
        .slice(0, 3)
        .map((e) => e.text.replace(/[.!?~]+$/, ""))
        .join(", ") +
      (entries.length > 3 ? " 외 " + (entries.length - 3) + "개의 순간." : ".");
    return { summary, tags, scene, mood };
  },

  async writeCuration({ periodLabel, count, top }: CurationInput): Promise<CurationText> {
    await sleep(600);
    const lead = top[0]?.tag ?? "일상";
    const second = top[1]?.tag;
    return {
      headline: second
        ? `${lead}${josa(lead, "과", "와")} ${second} 사이의 ${periodLabel}`
        : `${lead}${josa(lead, "으로", "로")} 채운 ${periodLabel}`,
      body:
        `[모의 해설] ${periodLabel} 동안 그림 ${count}장이 모였어요. ` +
        `가장 자주 등장한 건 '${lead}'${josa(lead, "이었", "였")}고` +
        (second ? `, 그다음은 '${second}'${josa(second, "이었", "였")}어요.` : "요.") +
        " 실제 버전에서는 저장된 장면 요약을 텍스트 AI에 넣어 이 자리에 해설을 씁니다.",
    };
  },
};

export const mockImage: ImageProvider = {
  name: "mock",

  // Returns a placeholder scene; components/Art.tsx draws it as SVG.
  async draw(summary: DaySummary): Promise<Drawing> {
    await sleep(1800);
    return { scene: summary.scene, imageUrl: null };
  },
};
