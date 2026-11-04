// Input checks shared by the API routes. The DB enums in db/schema.sql must match these lists.

import type { Scene, StyleId } from "@/lib/types";

export const STYLE_IDS: StyleId[] = ["water", "pencil", "crayon", "story"];
// Art.tsx only knows these; an unknown scene would render an empty picture.
export const SCENES: Scene[] = ["day", "cat", "rain", "park", "cafe", "night"];

export const isStyle = (v: unknown): v is StyleId => STYLE_IDS.includes(v as StyleId);
export const isScene = (v: unknown): v is Scene => SCENES.includes(v as Scene);

export const isDateKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const isIsoTime = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v) && !Number.isNaN(Date.parse(v));

export const isEmail = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Non-empty after trimming and at most `max` characters. */
export const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
