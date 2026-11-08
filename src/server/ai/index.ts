// Picks providers from env. Server-only: never import this from a client component.
//
//   AI_TEXT_PROVIDER  = mock | gemini | claude | openai   (default mock; gemini without GEMINI_API_KEY -> mock)
//   AI_IMAGE_PROVIDER = mock | claude-svg | openai   (default mock)

import { claudeSvgImage, claudeText } from "./claude";
import { geminiText } from "./gemini";
import { mockImage, mockText } from "./mock";
import { openaiImage, openaiText } from "./openai";
import type { ImageProvider, TextProvider } from "./types";

const TEXT: Record<string, TextProvider> = { mock: mockText, gemini: geminiText, claude: claudeText, openai: openaiText };
const IMAGE: Record<string, ImageProvider> = { mock: mockImage, "claude-svg": claudeSvgImage, openai: openaiImage };

function pick<T>(table: Record<string, T>, envName: string): T {
  const key = process.env[envName]?.trim() || "mock";
  const p = table[key];
  if (!p) throw new Error(`${envName}=${key} is not one of: ${Object.keys(table).join(", ")}`);
  return p;
}

export function textAI(): TextProvider {
  const p = pick(TEXT, "AI_TEXT_PROVIDER");
  if (p === geminiText && !process.env.GEMINI_API_KEY) {
    console.warn("[ai] AI_TEXT_PROVIDER=gemini but GEMINI_API_KEY is not set: using mock");
    return mockText;
  }
  return p;
}
export const imageAI = (): ImageProvider => pick(IMAGE, "AI_IMAGE_PROVIDER");

export { NotConfiguredError } from "./types";
