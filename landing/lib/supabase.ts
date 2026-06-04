import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazily created so `next build` never requires env at build time; the client is only
// constructed when the user actually submits (in the browser). NEXT_PUBLIC_* values are
// inlined at build, so they must be set in the Vercel project env for the live site.
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  cached = createClient(url, anonKey, { auth: { persistSession: false } });
  return cached;
}
