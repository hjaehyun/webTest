// Picks providers from env. Server-only: never import this from a client component.
//
//   AI_TEXT_PROVIDER  = mock | claude | openai       (default mock)
//   AI_IMAGE_PROVIDER = mock | claude-svg | openai   (default mock)

import { claudeSvgImage, claudeText } from "./claude";
import { mockImage, mockText } from "./mock";
import { openaiImage, openaiText } from "./openai";
import type { ImageProvider, TextProvider } from "./types";

const TEXT: Record<string, TextProvider> = { mock: mockText, claude: claudeText, openai: openaiText };
const IMAGE: Record<string, ImageProvider> = { mock: mockImage, "claude-svg": claudeSvgImage, openai: openaiImage };

function pick<T>(table: Record<string, T>, envName: string): T {
  const key = process.env[envName]?.trim() || "mock";
  const p = table[key];
  if (!p) throw new Error(`${envName}=${key} is not one of: ${Object.keys(table).join(", ")}`);
  return p;
}

export const textAI = (): TextProvider => pick(TEXT, "AI_TEXT_PROVIDER");
export const imageAI = (): ImageProvider => pick(IMAGE, "AI_IMAGE_PROVIDER");

export { NotConfiguredError } from "./types";
