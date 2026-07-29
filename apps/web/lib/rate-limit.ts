// A rate limit that does not get weaker as you get busier.
//
// The four routes that had one counted requests in a module-scope array. That is
// per-INSTANCE state on a platform that answers load by starting more instances,
// so the real ceiling was `limit x instances` — a cap that loosens exactly when
// traffic says it should tighten, and that is strictest on a quiet Tuesday.
//
// The count now lives in Postgres (`consume_rate_limit`, migration
// 20260729070000), incremented atomically, so every instance is counting into
// the same bucket.
//
// This is still a BACKSTOP, not the gate. Authentication is the gate; this stops
// one authenticated account from hammering an expensive route.

import { adminClient } from "@/lib/server";

export interface RateLimitResult {
  allowed: boolean;
  /** Requests spent in this window INCLUDING the current one, or null when the
   *  check itself could not run. */
  count: number | null;
}

/**
 * Spend one request against `bucket` for `subject`.
 *
 * FAILS OPEN, deliberately, and this is the opposite call from `verifyDeviceKey`
 * next door. That one guards WHO you are, so an outage must lock the door. This
 * one guards HOW OFTEN, so an outage that locked the door would turn a database
 * blip into a total outage of every route that calls it — a self-inflicted
 * denial of service, in the name of preventing one. Authentication still stands
 * in front, so failing open here degrades to "authenticated but unthrottled",
 * not to "open to anyone".
 */
export async function consumeRateLimit(
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const admin = adminClient();
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_bucket: bucket,
      p_limit: limit,
      p_subject: subject,
      p_window_seconds: windowSeconds,
    });
    if (error || !data || typeof data !== "object") return { allowed: true, count: null };
    const row = data as { allowed?: unknown; count?: unknown };
    return {
      allowed: row.allowed !== false,
      count: typeof row.count === "number" ? row.count : null,
    };
  } catch {
    return { allowed: true, count: null };
  }
}
