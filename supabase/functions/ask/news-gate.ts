// PURE gating for the /ask "In the news — not verified evidence" panel.
//
// PRODUCT RULE (owner, 2026-06-21): news in a regular answer is a PAID surface. On ANY question (owner
// widened this from drug-only), a paid user sees the real (walled) panel and a free user sees a locked
// upgrade teaser where the panel would be. The headlines NEVER enter the evidence pool, citations, or
// grounding — the wall is structural (the fetched items attach to AskResponse.news only, never to a
// RetrievedChunk).
//
// This module decides ONLY whether to fetch and whether to show the teaser, given the plan, whether
// there's a usable news query, and the live-sources flag. The QUERY is chosen by the caller (drug
// mentions when named, else the extracted topic) — kept out of here so the gate stays a pure, provable
// plan check (incl. the safe "unknown plan = unpaid" default). The fetch lives in ../news/news-source.ts.

export interface NewsGateInput {
  /** The user's billing plan, from consume_usage's `plan` (resolve_user_plan → subscriptions.plan,
   *  CHECK-constrained to free|plus|pro|student|professional|enterprise; defaults to "free"). */
  plan: string;
  /** The news search string the caller chose: the drug mentions when named, else the extracted topic.
   *  Empty (e.g. a question with no usable topic) → no panel for anyone. */
  query: string;
  /** The LIVE_SOURCES master flag — news rides the same switch as the live evidence providers. */
  liveSourcesOn: boolean;
}

export interface NewsGateDecision {
  /** Actually call the news source (paid + a non-empty query + live sources on). */
  fetch: boolean;
  /** Show the locked upgrade teaser instead of the panel (free user, where a paid user WOULD see news). */
  locked: boolean;
  /** The trimmed news search term; "" when the caller had no usable query. */
  query: string;
}

// EVERY non-free DB tier is "paid" for news — the owner's "Plus/Pro only" means "paid, not free", and
// professional/enterprise are HIGHER tiers than pro (locking them out would silently break the feature
// for the biggest customers). An explicit allow-list of the known paid tiers (not `!== "free"`) so an
// empty/garbage/leaked-status value fails CLOSED — unpaid → teaser, never giving the feature away.
const PAID_PLANS = new Set(["plus", "pro", "student", "professional", "enterprise"]);

/** Decide news fetching + teaser for one answer. Pure. */
export function decideNewsGate(input: NewsGateInput): NewsGateDecision {
  const query = input.query.trim();
  // Eligible = the panel COULD show here: live sources on and the caller had a usable query.
  const eligible = input.liveSourcesOn && query.length > 0;
  if (!eligible) return { fetch: false, locked: false, query };
  const paid = PAID_PLANS.has(input.plan);
  return { fetch: paid, locked: !paid, query };
}
