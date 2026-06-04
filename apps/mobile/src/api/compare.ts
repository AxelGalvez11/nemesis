import { supabase } from "./supabase";
import { toComparison } from "./cast";
import type { Comparison } from "@pharmabro/shared";

// GET /compare?left&right (the `compare` edge fn). It is GET-only + reads the entity
// uuids from the query string (NOT a JSON body), so we call the functions URL directly
// with the session JWT rather than supabase.functions.invoke (which POSTs a body).
// Authenticated-only; both ids are uuid-validated server-side (and we validate before
// calling). null = not-found / error.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export async function fetchComparison(left: string, right: string): Promise<Comparison | null> {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error("Supabase env missing");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("sign in to compare");

  const url = `${SUPABASE_URL}/functions/v1/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`;
  const res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null; // entity not found
  if (!res.ok) throw new Error(`compare failed (${res.status})`);
  return toComparison(await res.json());
}
