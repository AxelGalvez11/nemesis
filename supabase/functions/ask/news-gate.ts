// PURE gating for the /ask "In the news — not verified evidence" panel.
//
// PRODUCT RULE (owner, 2026-06-21): news in a regular answer is a PAID surface (Plus/Pro). A free
// user who asks about a drug sees a locked upgrade teaser where the panel would be; a paid user sees
// the real (walled) panel. The headlines NEVER enter the evidence pool, citations, or grounding — the
// wall is structural (the fetched items attach to AskResponse.news only, never to a RetrievedChunk).
//
// This module decides ONLY whether to fetch and whether to show the teaser, given plan + entities +
// the live-sources flag. Kept pure + unit-tested so the gating (and the safe "unknown plan = unpaid"
// default) is provable without standing up the orchestrator. The fetch itself lives in
// ../news/news-source.ts; the wiring in index.ts.

export interface NewsGateInput {
  /** The user's billing plan, from consume_usage's `plan` (resolve_user_plan → subscriptions.plan,
   *  CHECK-constrained to free|plus|pro|student|professional|enterprise; defaults to "free"). */
  plan: string;
  /** classify's verbatim drug/compound mentions — news is scoped to a named drug (generic Google News
   *  for a non-drug question is noise), so an empty list means "no panel for anyone". */
  entityMentions: string[];
  /** The LIVE_SOURCES master flag — news rides the same switch as the live evidence providers. */
  liveSourcesOn: boolean;
}

export interface NewsGateDecision {
  /** Actually call the news source (paid + a drug was named + live sources on). */
  fetch: boolean;
  /** Show the locked upgrade teaser instead of the panel (free user, where a paid user WOULD see news). */
  locked: boolean;
  /** The news search term (the drug mentions, trimmed/joined); "" when no drug was named. */
  query: string;
}

// EVERY non-free DB tier is "paid" for news — the owner's "Plus/Pro only" means "paid, not free", and
// professional/enterprise are HIGHER tiers than pro (locking them out would silently break the feature
// for the biggest customers). An explicit allow-list of the known paid tiers (not `!== "free"`) so an
// empty/garbage/leaked-status value fails CLOSED — unpaid → teaser, never giving the feature away.
const PAID_PLANS = new Set(["plus", "pro", "student", "professional", "enterprise"]);

/** Decide news fetching + teaser for one answer. Pure. */
export function decideNewsGate(input: NewsGateInput): NewsGateDecision {
  const query = input.entityMentions.map((m) => m.trim()).filter(Boolean).join(" ");
  // Eligible = the panel COULD show here: live sources on and a specific drug was named.
  const eligible = input.liveSourcesOn && query.length > 0;
  if (!eligible) return { fetch: false, locked: false, query };
  const paid = PAID_PLANS.has(input.plan);
  return { fetch: paid, locked: !paid, query };
}
