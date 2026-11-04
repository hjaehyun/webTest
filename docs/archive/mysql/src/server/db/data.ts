// All reads and writes of a user's diary data. Every query is scoped by user_id;
// this is what stands in for Supabase RLS ("my rows are mine only").

import { randomUUID } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Artwork, DB, Entry, Profile, Scene, StyleId } from "@/lib/types";
import { HttpError } from "../http";
import { fromSqlTime, pool, toSqlTime } from "./pool";

const DEFAULT_EXHIBITION_TITLE = "나의 전시";

const isDupKey = (err: unknown) => (err as { code?: string }).code === "ER_DUP_ENTRY";

async function inTransaction<T>(fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const out = await fn(c);
    await c.commit();
    return out;
  } catch (err) {
    await c.rollback();
    throw err;
  } finally {
    c.release();
  }
}

// ---- users -------------------------------------------------------------------

/** Creates the account and its (single, for now) exhibition. Returns the new user id. */
export async function createUser(email: string, passwordHash: string): Promise<string> {
  const id = randomUUID();
  try {
    await inTransaction(async (c) => {
      await c.execute("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)", [id, email, passwordHash]);
      await c.execute("INSERT INTO exhibitions (id, user_id, title) VALUES (?, ?, ?)", [
        randomUUID(),
        id,
        DEFAULT_EXHIBITION_TITLE,
      ]);
    });
  } catch (err) {
    if (isDupKey(err)) throw new HttpError(409, "이미 가입된 이메일이에요");
    throw err;
  }
  return id;
}

export async function findUserByEmail(email: string): Promise<{ id: string; passwordHash: string } | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT id, password_hash FROM users WHERE email = ?", [email]);
  const r = rows[0];
  return r ? { id: r.id, passwordHash: r.password_hash } : null;
}

export async function passwordHashOf(userId: string): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT password_hash FROM users WHERE id = ?", [userId]);
  return (rows[0]?.password_hash as string | undefined) ?? null;
}

/** Sets a new password and signs the user out everywhere; the caller starts a fresh session. */
export async function changePassword(userId: string, passwordHash: string): Promise<void> {
  await inTransaction(async (c) => {
    await c.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
    await c.execute("DELETE FROM sessions WHERE user_id = ?", [userId]);
  });
}

/** Deletes the account. Foreign keys cascade to sessions, profile, entries, artworks and exhibitions. */
export async function deleteUser(userId: string): Promise<void> {
  await pool.execute("DELETE FROM users WHERE id = ?", [userId]);
}

// ---- whole-diary read --------------------------------------------------------

/** Everything the screens need, in the same DB shape the localStorage store used. */
export async function loadDb(userId: string): Promise<DB> {
  const [[userRows], [profileRows], [entryRows], [artRows], [exRows]] = await Promise.all([
    pool.execute<RowDataPacket[]>("SELECT email, created_at FROM users WHERE id = ?", [userId]),
    pool.execute<RowDataPacket[]>("SELECT nick, style FROM profiles WHERE user_id = ?", [userId]),
    pool.execute<RowDataPacket[]>(
      "SELECT id, day, written_at, body FROM entries WHERE user_id = ? ORDER BY written_at",
      [userId],
    ),
    pool.execute<RowDataPacket[]>(
      "SELECT day, style, scene, summary, tags FROM daily_artworks WHERE user_id = ? AND status = 'done'",
      [userId],
    ),
    pool.execute<RowDataPacket[]>("SELECT id, title, description, is_public FROM exhibitions WHERE user_id = ?", [
      userId,
    ]),
  ]);

  const profile: Profile | null = profileRows[0]
    ? { nick: profileRows[0].nick, style: profileRows[0].style as StyleId }
    : null;

  const artworks: Record<string, Artwork> = {};
  for (const r of artRows) {
    artworks[r.day] = {
      date: r.day,
      scene: r.scene as Scene,
      style: r.style as StyleId,
      summary: r.summary,
      // mysql2 parses JSON columns, but tolerate a raw string too.
      tags: typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags,
      entries: [],
    };
  }

  // An entry belongs to its day's picture once that day is closed; otherwise it is a draft.
  const drafts: Record<string, Entry[]> = {};
  for (const r of entryRows) {
    const entry: Entry = { id: r.id, at: fromSqlTime(r.written_at), text: r.body };
    const art = artworks[r.day];
    if (art) art.entries.push(entry);
    else (drafts[r.day] ??= []).push(entry);
  }

  const ex = exRows[0];
  let dates: string[] = [];
  if (ex) {
    const [itemRows] = await pool.execute<RowDataPacket[]>(
      `SELECT a.day FROM exhibition_items i
         JOIN daily_artworks a ON a.id = i.artwork_id
        WHERE i.exhibition_id = ?
        ORDER BY i.position`,
      [ex.id],
    );
    dates = itemRows.map((r) => r.day as string);
  }

  const user = userRows[0];
  return {
    account: user ? { email: user.email, joinedAt: fromSqlTime(user.created_at) } : null,
    profile,
    drafts,
    artworks,
    exhibition: ex
      ? { id: ex.id, title: ex.title, desc: ex.description, isPublic: Boolean(ex.is_public), dates }
      : { id: "", title: DEFAULT_EXHIBITION_TITLE, desc: "", isPublic: false, dates: [] },
  };
}

// ---- writes ------------------------------------------------------------------

export async function saveProfile(userId: string, p: Profile): Promise<void> {
  await pool.execute(
    "INSERT INTO profiles (user_id, nick, style) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE nick = VALUES(nick), style = VALUES(style)",
    [userId, p.nick, p.style],
  );
}

async function dayIsClosed(userId: string, day: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT 1 FROM daily_artworks WHERE user_id = ? AND day = ?", [
    userId,
    day,
  ]);
  return rows.length > 0;
}

export async function addEntry(userId: string, day: string, e: Entry): Promise<void> {
  if (await dayIsClosed(userId, day)) throw new HttpError(409, "이미 마감한 날이에요");
  try {
    await pool.execute("INSERT INTO entries (id, user_id, day, written_at, body) VALUES (?, ?, ?, ?, ?)", [
      e.id,
      userId,
      day,
      toSqlTime(new Date(e.at)),
      e.text,
    ]);
  } catch (err) {
    if (isDupKey(err)) throw new HttpError(409, "이미 저장된 조각이에요");
    throw err;
  }
}

/** Deletes a draft entry. Entries of a closed day are part of its picture and stay. */
export async function removeEntry(userId: string, id: string): Promise<void> {
  const [res] = await pool.execute<ResultSetHeader>(
    `DELETE FROM entries
      WHERE id = ? AND user_id = ?
        AND NOT EXISTS (SELECT 1 FROM daily_artworks a WHERE a.user_id = entries.user_id AND a.day = entries.day)`,
    [id, userId],
  );
  if (res.affectedRows === 0) throw new HttpError(404, "지울 수 있는 조각이 없어요");
}

export async function saveArtwork(
  userId: string,
  a: { date: string; scene: Scene; style: StyleId; summary: string; tags: string[] },
): Promise<void> {
  try {
    await pool.execute(
      "INSERT INTO daily_artworks (user_id, day, style, scene, summary, tags) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, a.date, a.style, a.scene, a.summary, JSON.stringify(a.tags)],
    );
  } catch (err) {
    if (isDupKey(err)) throw new HttpError(409, "이날은 이미 그림이 있어요");
    throw err;
  }
}

/** Updates the user's exhibition. `dates` replaces the hung pictures, in order. */
export async function updateExhibition(
  userId: string,
  patch: { isPublic?: boolean; dates?: string[] },
): Promise<void> {
  await inTransaction(async (c) => {
    const [exRows] = await c.execute<RowDataPacket[]>("SELECT id FROM exhibitions WHERE user_id = ? FOR UPDATE", [
      userId,
    ]);
    const exId = exRows[0]?.id as string | undefined;
    if (!exId) throw new HttpError(404, "전시회가 없어요");

    if (patch.isPublic !== undefined) {
      await c.execute("UPDATE exhibitions SET is_public = ? WHERE id = ?", [patch.isPublic, exId]);
    }

    if (patch.dates) {
      await c.execute("DELETE FROM exhibition_items WHERE exhibition_id = ?", [exId]);
      if (patch.dates.length === 0) return;

      // Only the user's own pictures can be hung.
      const [artRows] = await c.query<RowDataPacket[]>("SELECT id, day FROM daily_artworks WHERE user_id = ? AND day IN (?)", [
        userId,
        patch.dates,
      ]);
      const idByDay = new Map(artRows.map((r) => [r.day as string, r.id as number]));
      const missing = patch.dates.filter((d) => !idByDay.has(d));
      if (missing.length) throw new HttpError(400, `그림이 없는 날짜예요: ${missing.join(", ")}`);

      await c.query("INSERT INTO exhibition_items (exhibition_id, artwork_id, position) VALUES ?", [
        patch.dates.map((d, i) => [exId, idByDay.get(d), i]),
      ]);
    }
  });
}
