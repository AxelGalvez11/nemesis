// "Is this caller the service role?" — answered without assuming WHICH service
// key they hold.
//
// 🔴 WHY THIS IS NOT A STRING COMPARISON. It was, for about an hour on
// 2026-08-05, and the acceptance test caught it: this project now has TWO
// service-role credentials — the legacy `eyJ…` JWT and the newer
// `sb_secret_…` key — and they are NOT interchangeable as strings.
//
// The platform injects the NEW one into edge functions as
// SUPABASE_SERVICE_ROLE_KEY. The web server's Vercel environment was set 61 days
// earlier and holds the LEGACY one. Both are perfectly valid service-role
// credentials; both authenticate against PostgREST. But
// `token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` accepts exactly one of
// them, so every call from the web app to a function was rejected 403 while
// function-to-function calls passed — a failure that only appears in production,
// only on one of the two paths, and looks like a permissions bug rather than a
// key-format one.
//
// 🔴 THE PROBE MUST TEST AUTHORIZATION, NOT VISIBILITY. The first attempt at
// this read one row from an RLS-protected TABLE and accepted any 200 — which the
// anon key also gets, as `200 []`. RLS hides rows; it does not refuse the
// request. That briefly let an anon key drive the recording worker and declare
// any user id it liked, and it was caught only because the acceptance test tried
// the anon key on purpose. A row count is not a permission check.
//
// So the probe is a FUNCTION whose EXECUTE is granted to service_role alone.
// Measured against the live project: anon gets 401 `permission denied for
// function`, service gets 200. Any service-only, side-effect-free RPC would do;
// this one is used because it exists today and takes a bounded argument.
//
// If that function is ever renamed the probe returns 404, which reads as "not
// authorized" — this fails CLOSED, which is the direction to fail in.
//
// The cost is one HTTP request the first time an isolate sees a given token, and
// nothing after that. The fast path — the key this function was itself given —
// costs nothing at all and covers every function-to-function call.

/** Tokens this isolate has already proven. Bounded so a caller cannot grow it
 *  without limit by presenting endless distinct tokens; at that size it is
 *  effectively "the two or three real keys in play". */
const proven = new Set<string>();
const PROVEN_LIMIT = 8;

/** Read-only, and `revoke execute … from public, anon, authenticated` in
 *  20260725T01_library_index_backoff.sql. Being ALLOWED to call it is the proof. */
const PROBE_RPC = "rpc/list_dirty_library_docs";
const PROBE_BODY = JSON.stringify({ p_limit: 1 });

export interface ServiceAuthConfig {
  supabaseUrl: string;
  /** Whatever this function was injected with. Matched first, for free. */
  serviceKey: string;
}

/**
 * Whether `token` carries service-role authority on this project.
 *
 * Never throws: a probe that cannot be made answers "no", which fails closed.
 */
export async function isServiceCaller(token: string, config: ServiceAuthConfig): Promise<boolean> {
  if (!token) return false;
  // Fast path — the key we hold ourselves. Length first so a mismatched token is
  // not compared byte by byte.
  if (config.serviceKey && token.length === config.serviceKey.length && token === config.serviceKey) return true;
  if (proven.has(token)) return true;
  if (!config.supabaseUrl) return false;

  try {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/${PROBE_RPC}`, {
      body: PROBE_BODY,
      headers: { apikey: token, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!res.ok) return false;
    // Read the body so the connection is not left half-open between requests.
    await res.text().catch(() => "");
    if (proven.size >= PROVEN_LIMIT) proven.clear();
    proven.add(token);
    return true;
  } catch {
    return false;
  }
}

/** A uuid, and nothing that merely looks like one. A service caller's declared
 *  user id is trusted, so it is checked in full rather than for length. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidOrNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return UUID.test(text) ? text : null;
}
