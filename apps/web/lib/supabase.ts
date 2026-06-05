"use client";

import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./env";

// Build-safe fallback: Next prerenders server pages before Vercel injects runtime
// client env in local builds. Real browser use still requires NEXT_PUBLIC_*.
export const supabase = createClient(
  supabaseUrl || "http://127.0.0.1:54321",
  supabaseAnonKey || "missing-anon-key",
  {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
