// Claude (Anthropic) provider stub. Not wired up yet: the AI vendor is undecided.
//
// To implement:
//   npm i @anthropic-ai/sdk
//   set ANTHROPIC_API_KEY in .env.local
//   replace each method body with a client.messages.create(...) call that returns JSON
//   (structured outputs via output_config.format keep the shape stable).
// summarizeDay must also return mood: one of MOODS in src/server/music/key.ts.
// Claude returns text only, so image drawing here would mean asking for SVG markup.
// Stub methods leave out the interface's parameters; add them back when implementing.

import { NotConfiguredError, type ImageProvider, type TextProvider } from "./types";

const TODO = "아직 구현되지 않았습니다 (src/server/ai/claude.ts)";

export const claudeText: TextProvider = {
  name: "claude",
  async summarizeDay() {
    throw new NotConfiguredError("claude", TODO);
  },
  async writeCuration() {
    throw new NotConfiguredError("claude", TODO);
  },
};

/** Option A in the plan: Claude writes the day's picture as SVG. */
export const claudeSvgImage: ImageProvider = {
  name: "claude-svg",
  async draw() {
    throw new NotConfiguredError("claude-svg", TODO);
  },
};
