// OpenAI provider stub. Not wired up yet: the AI vendor is undecided.
//
// To implement:
//   npm i openai
//   set OPENAI_API_KEY in .env.local
//   text: chat/responses call that returns { summary, tags, scene } as JSON
//   image: gpt-image-1-mini, medium quality, 1024px (plan estimate $0.011 per image)
// Image bytes need somewhere to live (Supabase Storage later) before imageUrl can be set.
// Stub methods leave out the interface's parameters; add them back when implementing.

import { NotConfiguredError, type ImageProvider, type TextProvider } from "./types";

const TODO = "아직 구현되지 않았습니다 (src/server/ai/openai.ts)";

export const openaiText: TextProvider = {
  name: "openai",
  async summarizeDay() {
    throw new NotConfiguredError("openai", TODO);
  },
  async writeCuration() {
    throw new NotConfiguredError("openai", TODO);
  },
};

export const openaiImage: ImageProvider = {
  name: "openai",
  async draw() {
    throw new NotConfiguredError("openai", TODO);
  },
};
