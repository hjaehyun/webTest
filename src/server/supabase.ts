// Supabase clients for server code. Keys come from .env.local (see .env.example) and never reach the browser.

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (.env.local)`);
  return v;
}

const NO_STORAGE = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/**
 * Acts as the signed-in user: the auth session lives in cookies, so RLS sees auth.uid().
 * Use this for everything the user does with their own data.
 */
export async function supabaseForRequest(): Promise<SupabaseClient> {
  const jar = await cookies();
  return createServerClient(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) jar.set(name, value, options);
      },
    },
  });
}

/** Throwaway client with no cookies, e.g. to check a password without touching the browser's session. */
export function supabaseStateless(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"), NO_STORAGE);
}

/** Bypasses RLS. Only for admin actions the user can't do themselves (deleting their account). */
export function supabaseAdmin(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), NO_STORAGE);
}
