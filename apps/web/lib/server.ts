import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseAnonKey, supabaseUrl, requireServerEnv } from "./env";

export interface VerifiedUser {
  id: string;
  email: string | null;
}

export function adminClient() {
  requireServerEnv();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function verifyBearer(req: Request): Promise<VerifiedUser | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !supabaseUrl || !supabaseAnonKey) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json() as { id?: string; email?: string; is_anonymous?: boolean };
  if (!user.id || user.is_anonymous) return null;
  return { id: user.id, email: user.email ?? null };
}

export function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}
