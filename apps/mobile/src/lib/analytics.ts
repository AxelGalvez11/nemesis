// Privacy-enforcing, SDK-agnostic product analytics (doc-14).
//
// HARD PRIVACY RULE (doc-14 §Privacy approach): NO sensitive health detail ever
// reaches an analytics sink — no medication names, conditions, allergies, raw
// question/search text, or health-context fields. capture() runs every event's
// props through sanitizeProps(), which enforces BOTH:
//   1. KEY allowlist  — only ALLOWED_PROP_KEYS pass (no `medications`, `question`…);
//   2. VALUE contract — per-key validation: `entity_id` MUST be a UUID (never a drug
//      name), `intent`/`evidence_grade`/`plan` MUST be a known enum value (never raw
//      question text), other string keys MUST be slug-like tokens (no spaces / free
//      text), numbers must be finite, booleans must be booleans.
// Anything failing either check is dropped. This is the real guarantee: a careless
// caller that routes a drug name through `entity_id` or raw question text through
// `intent` leaks nothing — the value is rejected, not just the unknown keys.
//
// The sink is INJECTABLE and defaults to NO-OP, so analytics is inert until an
// operator wires a real provider (PostHog) with a key — no PII/health risk, and
// no SDK dependency, in the meantime. capture() never throws: analytics must never
// break the app.
//
// NOTE (enum duplication): the INTENTS/GRADES sets below are a LOCAL copy of the
// `@pharmabro/shared` unions. They are duplicated (not imported) on purpose — this
// file is unit-tested under Deno (`deno test --no-check`), which can't resolve the
// workspace runtime import. This is a privacy guardrail, not the source of truth;
// if the shared unions grow, widen these. A too-narrow set only DROPS an event prop
// (fails safe), it never leaks.

// Runtime event list — the type is derived from it so the validation Set and the
// union can't drift (same trick as ALLOWED_PROP_KEYS).
export const ANALYTICS_EVENTS = [
  // onboarding
  "onboarding_started",
  "interest_selected",
  "signup_started",
  "signup_completed",
  "guest_started",
  "notification_permission_seen",
  "notification_permission_granted",
  "health_context_intro_seen",
  "health_context_skipped",
  // ask
  "ask_question_submitted",
  "ask_intent_classified",
  "source_retrieval_started",
  "source_retrieval_completed",
  "answer_generated",
  "answer_viewed",
  "citation_tapped",
  "followup_question_tapped",
  "answer_saved",
  "answer_reported",
  // drug / explore
  "search_submitted",
  "search_result_clicked",
  "drug_page_viewed",
  "drug_tab_opened",
  "evidence_badge_tapped",
  "compare_started",
  "class_page_viewed",
  "popular_item_clicked",
  // watchlist
  "watchlist_add_started",
  "watchlist_item_added",
  "watchlist_limit_hit",
  "watchlist_item_removed",
  "watchlist_update_viewed",
  "digest_generated",
  "digest_opened",
  "notification_opened",
  // monetization
  "paywall_viewed",
  "subscription_trial_started",
  "subscription_started",
  "subscription_cancelled",
  "subscription_renewed",
  "subscription_failed",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

const EVENTS = new Set<string>(ANALYTICS_EVENTS);

// Allowlisted, NON-health, non-PII property keys. Generalized categories + IDs
// only (doc-14). Every key is an opaque ID, an enum label, a boolean, or a number.
export const ALLOWED_PROP_KEYS = [
  "entity_id", // catalog UUID, never a drug name
  "intent", // classifier enum, never the question text
  "source_type", // provider enum
  "evidence_grade", // enum
  "template", // answer-template enum
  "screen", // route name
  "tab", // tab id
  "count", // numeric
  "position", // numeric (list index)
  "is_guest", // bool
  "used_health_context", // bool — WHETHER it was used, never the content
  "refused", // bool
  "has_sources", // bool
  "plan", // "free" | "pro"
  "interest", // onboarding interest enum
] as const;

export type AllowedPropKey = (typeof ALLOWED_PROP_KEYS)[number];

/** Scalar-only value shape. No nested objects (which could smuggle health detail). */
export type EventProps = Partial<Record<AllowedPropKey, string | number | boolean>>;

// ---- value validators (the VALUE half of the guarantee) --------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Slug-like enum token: letters/digits/_/-, ≤64 chars, no spaces/punctuation/free text.
const SAFE_TOKEN_RE = /^[a-z0-9_-]{1,64}$/i;
// Local copy of the shared unions (see header note).
const INTENTS = new Set([
  "drug_overview", "drug_interaction", "side_effects", "label_summary", "comparison",
  "mechanism", "trial_lookup", "evidence_for_claim", "supplement_peptide", "dosing",
  "emergency_overdose", "pregnancy_pediatrics", "health_context", "drug_sourcing", "investment",
]);
const GRADES = new Set([
  "very_strong", "strong", "moderate", "weak", "very_weak", "unknown", "not_applicable",
]);
const PLANS = new Set(["free", "pro"]);

const isFiniteNum = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);
const isBool = (v: unknown): boolean => typeof v === "boolean";
const isToken = (v: unknown): boolean => typeof v === "string" && SAFE_TOKEN_RE.test(v);
const inSet = (set: Set<string>) => (v: unknown): boolean => typeof v === "string" && set.has(v);

const PROP_VALIDATORS: Record<AllowedPropKey, (v: unknown) => boolean> = {
  entity_id: (v) => typeof v === "string" && UUID_RE.test(v),
  intent: inSet(INTENTS),
  source_type: isToken,
  evidence_grade: inSet(GRADES),
  template: isToken,
  screen: isToken,
  tab: isToken,
  count: isFiniteNum,
  position: isFiniteNum,
  is_guest: isBool,
  used_health_context: isBool,
  refused: isBool,
  has_sources: isBool,
  plan: inSet(PLANS),
  interest: isToken,
};

const ALLOWED = new Set<string>(ALLOWED_PROP_KEYS);

/**
 * Keep only allowlisted keys whose value passes that key's validator; drop
 * everything else. The deterministic privacy guarantee: a caller cannot leak a
 * drug name (entity_id rejects non-UUIDs), raw question text (intent rejects
 * non-enum values), or any free-text/health field (unknown keys + non-token
 * strings are dropped).
 */
export function sanitizeProps(props: Record<string, unknown> | undefined): EventProps {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(props)) {
    if (!ALLOWED.has(key)) continue; // also rejects __proto__/constructor (not in the set)
    const value = props[key];
    const validator = PROP_VALIDATORS[key as AllowedPropKey];
    if (validator(value)) out[key] = value as string | number | boolean;
  }
  return out;
}

/** A pluggable analytics backend. The real PostHog adapter implements this; tests
 *  inject a recording sink; the default is a no-op. */
export interface AnalyticsSink {
  capture(event: AnalyticsEvent, props: EventProps): void;
  identify?(distinctId: string, props?: EventProps): void;
  reset?(): void;
  /** Flush buffered events (PostHog batches; call on background / before kill). */
  flush?(): Promise<void> | void;
}

const noopSink: AnalyticsSink = { capture: () => {} };

let sink: AnalyticsSink = noopSink;
let optedOut = false;
// Boot race: identify() can fire (from the auth listener) before the real sink is
// wired (an async bootstrap). Buffer the id and replay it once a sink connects, so
// returning users are still attributed. Only the latest id is kept.
let pendingDistinctId: string | null = null;

/** Surface a sink failure in development only (analytics is best-effort in prod). */
function devWarn(scope: string, e: unknown): void {
  // @ts-ignore __DEV__ is injected by the RN/Expo runtime; absent under Deno tests.
  if (typeof __DEV__ !== "undefined" && __DEV__) console.warn(`[analytics] ${scope} failed:`, e);
}

/** Wire a real backend (e.g. a PostHog adapter). Until called, analytics no-ops.
 *  IMPORTANT (sink-wiring slice): hydrate the opt-out flag from persistent storage
 *  (setOptOut) BEFORE calling this, so an opted-out user never emits during boot. */
export function configureAnalytics(next: AnalyticsSink): void {
  sink = next;
  // Replay a buffered identify (fired before this sink connected).
  if (pendingDistinctId !== null && !optedOut) {
    const id = pendingDistinctId;
    pendingDistinctId = null;
    try {
      sink.identify?.(id);
    } catch (e) {
      devWarn("identify", e);
    }
  }
}

/** Restore the no-op sink (sign-out, and test isolation). */
export function resetAnalyticsSink(): void {
  sink = noopSink;
  pendingDistinctId = null;
}

/**
 * Consent toggle. When opted out, nothing is captured.
 * NOTE (sink-wiring slice): this is in-memory only. Before a real sink ships, the
 * caller MUST persist this (SecureStore) and rehydrate it at boot — otherwise a
 * consent withdrawal silently resets to opted-IN on the next cold start.
 */
export function setOptOut(value: boolean): void {
  optedOut = value;
}

export function isOptedOut(): boolean {
  return optedOut;
}

/** Record an event. Unknown event names and unsafe props are dropped; sink errors
 *  are swallowed (analytics must never break the app). */
export function capture(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (optedOut) return;
  if (!EVENTS.has(event)) return; // defense: only the doc-14 taxonomy is emitted
  try {
    sink.capture(event, sanitizeProps(props));
  } catch (e) {
    devWarn("capture", e);
  }
}

/**
 * Associate the session with a user. `distinctId` MUST be an opaque internal id
 * (the Supabase user UUID) — NEVER an email, phone, or human-readable identifier.
 * Email-shaped ids are rejected as a guard. Props are sanitized like events.
 */
export function identify(distinctId: string, props?: Record<string, unknown>): void {
  if (optedOut) return;
  if (typeof distinctId !== "string" || distinctId.length === 0 || distinctId.includes("@")) {
    devWarn("identify", new Error("distinctId must be an opaque id, not an email/PII"));
    return;
  }
  if (sink === noopSink) {
    // No real sink yet (boot race): buffer; configureAnalytics() replays it.
    pendingDistinctId = distinctId;
    return;
  }
  try {
    sink.identify?.(distinctId, sanitizeProps(props));
  } catch (e) {
    devWarn("identify", e);
  }
}

/** Clear the associated user (sign-out). */
export function resetAnalyticsUser(): void {
  try {
    sink.reset?.();
  } catch (e) {
    devWarn("reset", e);
  }
}

/** Flush buffered events (call on app background / before termination). */
export async function flushAnalytics(): Promise<void> {
  try {
    await sink.flush?.();
  } catch (e) {
    devWarn("flush", e);
  }
}
