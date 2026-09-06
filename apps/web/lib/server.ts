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

/** A per-request client that acts AS the signed-in user (their bearer token), so reads/writes
 *  are RLS-enforced to their own rows. Use this — not adminClient — to read user-owned data in
 *  route handlers (e.g. saved_reports), so the route can never read another user's row. */
export function userClient(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
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

// Route logging. One line per request, always JSON, always the same field names, so the
// Vercel log search can answer "which route failed for which user" in one query.

/** Reads the user id out of a bearer token WITHOUT verifying it. Logging only: never trust
 *  this for access decisions. The middle JWT segment is base64url JSON with a `sub`. */
export function unverifiedUserId(req: Request): string | undefined {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const middle = token.split(".")[1];
    if (!middle) return undefined;
    const payload = JSON.parse(Buffer.from(middle, "base64url").toString("utf8")) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

export interface RouteLogExtra {
  /** performance.now() at the start of the handler; duration_ms is derived from it. */
  startedAt?: number;
  requestId?: string;
  [key: string]: unknown;
}

/** One info line `route` with method, path, status, duration and the user id when present. */
export function logRoute(req: Request, status: number, extra: RouteLogExtra = {}): void {
  try {
    const { startedAt, ...rest } = extra;
    const url = new URL(req.url);
    console.info(JSON.stringify({
      event: "route",
      method: req.method,
      path: url.pathname,
      status,
      duration_ms: typeof startedAt === "number" ? Math.round(performance.now() - startedAt) : undefined,
      user_id: unverifiedUserId(req),
      ...rest,
    }));
  } catch {
    /* logging must never break a route */
  }
}

type RouteHandler<R extends Request, C> = (req: R, ctx: C) => Promise<Response> | Response;

/** Wraps a route handler: stamps a request id, times it, logs the status, and turns a thrown
 *  error into a `route_failed` line plus a 500 `{ error: "internal_error", request_id }` so the
 *  learner gets a reference they can quote and we can find the line. */
export function withRouteLog<R extends Request, C = unknown>(handler: RouteHandler<R, C>): RouteHandler<R, C> {
  return async (req: R, ctx: C) => {
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    try {
      const res = await handler(req, ctx);
      logRoute(req, res.status, { startedAt, requestId });
      return res;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack?.slice(0, 800) : undefined;
      try {
        const url = new URL(req.url);
        console.error(JSON.stringify({
          event: "route_failed",
          method: req.method,
          path: url.pathname,
          status: 500,
          duration_ms: Math.round(performance.now() - startedAt),
          user_id: unverifiedUserId(req),
          request_id: requestId,
          message,
          stack,
        }));
      } catch {
        /* logging must never break a route */
      }
      return json({ error: "internal_error", request_id: requestId }, 500);
    }
  };
}
