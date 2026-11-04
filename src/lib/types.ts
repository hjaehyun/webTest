// Shapes mirror the planned Supabase tables so the mock store can be swapped later.
// profiles -> Profile, entries -> Entry, daily_artworks -> Artwork, exhibitions(+items) -> Exhibition

export type Scene = "day" | "cat" | "rain" | "park" | "cafe" | "night";
export type StyleId = "water" | "pencil" | "crayon" | "story";

export type Profile = {
  nick: string;
  style: StyleId;
};

export type Entry = {
  id: string;
  at: string; // ISO timestamp
  text: string;
};

export type Artwork = {
  date: string; // YYYY-MM-DD
  scene: Scene; // stands in for image_url until the image AI is wired up
  style: StyleId;
  summary: string; // scene_summary from the text AI
  tags: string[];
  entries: Entry[];
};

export type Exhibition = {
  id: string;
  title: string;
  desc: string;
  isPublic: boolean;
  dates: string[]; // ordered artwork dates
};

// API payloads shared by the client (lib/ai.ts) and the server routes (app/api/*).

/** Text AI result: fragments -> one scene description + tags. */
export type DaySummary = { summary: string; tags: string[]; scene: Scene };

/** Image AI result. imageUrl stays null until a real image provider is wired up. */
export type Drawing = { scene: Scene; imageUrl: string | null };

/** Curator commentary input; counting happens before the AI call. */
export type CurationInput = {
  periodLabel: string;
  count: number;
  top: { tag: string; count: number }[];
  summaries: string[];
};

export type CurationText = { headline: string; body: string };

/** Sign-in account (users table); shown on the my page. */
export type Account = {
  email: string;
  joinedAt: string; // ISO timestamp
};

export type DB = {
  account: Account | null;
  profile: Profile | null;
  drafts: Record<string, Entry[]>; // entries not yet closed, keyed by date
  artworks: Record<string, Artwork>;
  exhibition: Exhibition;
};
