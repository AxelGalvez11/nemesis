// Which keys the internal cron/service path accepts as a valid caller.
//
// The watch-check + watch-digest functions are invoked by pg_cron via pg_net with a bearer token. The
// caller must present a service-role-privileged key. Historically that was ONLY the legacy service-role
// key (auto-injected as SUPABASE_SERVICE_ROLE_KEY), but matching the Vault value against that opaque
// auto-injected key proved brittle. Supabase's new API keys expose named secret keys (sb_secret_…) to
// functions as a JSON dict in SUPABASE_SECRET_KEYS, e.g. {"default":"sb_secret_…"}. Accepting those too
// lets the scheduler authenticate with a stable key we set explicitly on both sides.
//
// Pure + env-free so it can be unit-tested; index.ts passes the raw env values in.

/** Build the set of accepted caller keys from the legacy service-role key + the SUPABASE_SECRET_KEYS JSON.
 *  Tolerant of a missing/malformed SUPABASE_SECRET_KEYS (returns just the legacy key). Empty strings and
 *  non-string dict values are dropped so an unset key never becomes an accepted credential.
 *
 *  ASSUMPTION (least-privilege): every value Supabase injects into SUPABASE_SECRET_KEYS is
 *  service-role-privileged (the new secret keys replace service_role 1:1 today). If Supabase ever adds
 *  *scoped* secret keys, pin this to a single named key (e.g. dict["watch_cron"]) instead of accepting all. */
export function acceptedCallerKeys(serviceKey: string, secretKeysJson: string | undefined | null): Set<string> {
  const fromSecret: unknown[] = (() => {
    try {
      const dict = JSON.parse(secretKeysJson ?? "{}");
      // SUPABASE_SECRET_KEYS is a { name: key } object; ignore arrays/primitives defensively.
      return dict && typeof dict === "object" && !Array.isArray(dict) ? Object.values(dict) : [];
    } catch {
      return [];
    }
  })();
  return new Set(
    [serviceKey, ...fromSecret].filter((v): v is string => typeof v === "string" && v.length > 0),
  );
}
