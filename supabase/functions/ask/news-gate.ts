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

// Every paid plan code, present and retired.
//
// 🔴 `nemesis` HAD TO BE ADDED HERE, AND ITS ABSENCE WOULD HAVE BEEN SILENT.
// `resolve_user_plan` now returns the canonical code, so without this row every
// paying subscriber would have fallen to the unpaid branch and seen the teaser
// instead of live news -- a paid feature quietly withheld from the people paying
// for it, with nothing anywhere reporting a failure.
//
// The retired codes stay because an old record still says them. An explicit
// allow-list (not `!== "free"`) so an empty, garbage or leaked-status value fails
// CLOSED -- unpaid means teaser, never giving the feature away.
const PAID_PLANS = new Set([
  "nemesis",
  "plus",
  "pro",
  "max",
  "student",
  "professional",
  "trial",
  "enterprise",
]);

/** Decide news fetching + teaser for one answer. Pure. */
export function decideNewsGate(input: NewsGateInput): NewsGateDecision {
  const query = input.query.trim();
  // Eligible = the panel COULD show here: live sources on and the caller had a usable query.
  const eligible = input.liveSourcesOn && query.length > 0;
  if (!eligible) return { fetch: false, locked: false, query };
  const paid = PAID_PLANS.has(input.plan);
  return { fetch: paid, locked: !paid, query };
}
