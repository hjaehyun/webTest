// Picks providers from env. Server-only: never import this from a client component.
//
//   AI_TEXT_PROVIDER  = mock | gemini | claude | openai   (default mock; gemini without GEMINI_API_KEY -> mock)
//   AI_IMAGE_PROVIDER = mock | cloudflare | claude-svg | openai   (default mock; cloudflare without keys -> mock)

import { claudeSvgImage, claudeText } from "./claude";
import { cloudflareImage } from "./cloudflare";
import { geminiText } from "./gemini";
import { mockImage, mockText } from "./mock";
import { openaiImage, openaiText } from "./openai";
import type { ImageProvider, TextProvider } from "./types";

const TEXT: Record<string, TextProvider> = { mock: mockText, gemini: geminiText, claude: claudeText, openai: openaiText };
const IMAGE: Record<string, ImageProvider> = { mock: mockImage, cloudflare: cloudflareImage, "claude-svg": claudeSvgImage, openai: openaiImage };

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
export function imageAI(): ImageProvider {
  const p = pick(IMAGE, "AI_IMAGE_PROVIDER");
  if (p === cloudflareImage && !(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN)) {
    console.warn("[ai] AI_IMAGE_PROVIDER=cloudflare but CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN is not set: using mock");
    return mockImage;
  }
  return p;
}

export { NotConfiguredError } from "./types";
