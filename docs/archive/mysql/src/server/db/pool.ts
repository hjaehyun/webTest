// One MySQL connection pool for the whole server. Settings come from .env.local (see .env.example).

import mysql, { type Pool } from "mysql2/promise";

function create(): Pool {
  return mysql.createPool({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "haru_jogak",
    charset: "utf8mb4",
    connectionLimit: 5,
    // DATETIME columns hold UTC, and DATE/DATETIME come back as plain strings
    // so a server in another time zone can't shift the user's day.
    timezone: "Z",
    dateStrings: true,
  });
}

// Dev hot reload re-runs this module; reuse the pool instead of leaking a new one each time.
const g = globalThis as typeof globalThis & { haruPool?: Pool };
export const pool: Pool = (g.haruPool ??= create());

/** Date -> 'YYYY-MM-DD HH:MM:SS.mmm' (UTC) for DATETIME(3) columns. */
export const toSqlTime = (d: Date) => d.toISOString().slice(0, 23).replace("T", " ");

/** DATETIME(3) string (UTC) -> ISO timestamp. */
export const fromSqlTime = (s: string) => `${s.replace(" ", "T")}Z`;
