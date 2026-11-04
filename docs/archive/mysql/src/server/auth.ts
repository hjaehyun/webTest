// Email + password sign-in with a server-side session.
// The browser keeps a random token in an httpOnly cookie; the DB keeps only its SHA-256,
// so a leaked sessions table can't be replayed as cookies.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2/promise";
import { pool, toSqlTime } from "./db/pool";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const COOKIE = "haru_session";
const SESSION_DAYS = 30;
const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "hex");
  const got = await scrypt(password, Buffer.from(salt, "hex"), want.length);
  return timingSafeEqual(want, got);
}

// Checked when the email doesn't exist, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(KEY_LEN * 2)}`;
export const verifyNobody = (password: string) => verifyPassword(password, DUMMY_HASH);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    sha256(token),
    userId,
    toSqlTime(expires),
  ]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

/** The signed-in user's id, or null. Every /api/me route starts here. */
export async function currentUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(3)",
    [sha256(token)],
  );
  return (rows[0]?.user_id as string | undefined) ?? null;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await pool.execute("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
  jar.delete(COOKIE);
}
