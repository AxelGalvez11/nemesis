// Which of a connected app's actions Nemesis may run on its own, and which it must ask about.
//
// Owner's build order, workstream E, 2026-08-24, and the owner agreed the safety line in the
// plan before any of this was written: **reading is free, writing asks first.** Nemesis may read
// the learner's Drive and mail without checking in each time. Before it sends an email, posts a
// message, or deletes anything, it must show a confirmation card and wait for a click.
//
// 🔴🔴🔴 THE CLASSIFICATION FAILS CLOSED, AND THIS IS THE SINGLE MOST IMPORTANT LINE IN THE
// FEATURE. An action is a READ only if its verb appears in `READ_VERBS` below. Everything else is
// a WRITE — including every action this file has never heard of. Composio's catalogue is
// hundreds of actions long and grows without us; a rule shaped "block the dangerous ones" is a
// blocklist that is wrong the day a provider ships `GMAIL_SEND_DRAFT_V2`, and being wrong in that
// direction means Nemesis sent a stranger an email on the learner's behalf. Being wrong in the
// safe direction means one extra click. Those costs are nowhere near each other.
//
// 🔴 SO A NEW READ VERB IS A DELIBERATE ADDITION, NEVER AN INFERENCE. Adding to `READ_VERBS` is
// the only way an action becomes silent, and the test file treats every entry as a decision that
// had to be made on purpose.
//
// 🔴 IT READS THE VERB, NOT THE APP. `GMAIL_FETCH_EMAILS` and `GOOGLEDRIVE_DOWNLOAD_FILE` are the
// same kind of act performed on different property; nothing here has a special case per provider,
// which is what keeps it correct for the fourth app nobody has connected yet.
//
// PURE. No React, no I/O, no network.

/**
 * The verbs that make an action a read.
 *
 * 🔴 EVERY ONE OF THESE IS A CLAIM THAT THE ACTION CANNOT CHANGE ANYTHING THE LEARNER OWNS, and
 * each was chosen by asking that question rather than by pattern-matching a word list. Note what
 * is deliberately ABSENT: `EXPORT` (which some providers implement as a write-then-share),
 * `SYNC` (bidirectional), `COPY` (creates), and `MOVE` (removes from somewhere).
 */
const READ_VERBS = [
  "GET",
  "FETCH",
  "LIST",
  "FIND",
  "SEARCH",
  "READ",
  "DOWNLOAD",
  "COUNT",
  "CHECK",
  "LOOKUP",
  "RETRIEVE",
] as const;

/** How an action reaches the learner. */
export type ActionRisk =
  /** Runs silently. Cannot change anything they own. */
  | "read"
  /** Held until the learner clicks a confirmation card. */
  | "write";

/**
 * Split a Composio action slug into its app and its verb.
 *
 * Slugs are `APP_VERB_NOUN` — `GMAIL_SEND_EMAIL`, `GOOGLEDRIVE_FIND_FILE`. The app segment can
 * itself be multi-word (`GOOGLE_DRIVE_...` in some catalogue versions), which is exactly why this
 * does NOT try to identify the app by splitting: it looks for a read verb ANYWHERE in the slug's
 * segments, and treats a slug it cannot parse as a write.
 */
export function actionSegments(action: string): readonly string[] {
  return action
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/**
 * Read or write.
 *
 * 🔴🔴 THE DEFAULT IS "write", AND NOTHING MAY CHANGE THAT. An empty string, a slug in an
 * unexpected shape, a verb nobody has seen: all writes, all confirmed by a human before they run.
 */
export function riskOf(action: string): ActionRisk {
  const segments = actionSegments(action);
  if (segments.length === 0) return "write";
  // 🔴 THE VERB MUST BE A WHOLE SEGMENT. Substring matching would read `GMAIL_SEND_DRAFT` as a
  // read on the strength of the "END" inside "SEND" — the exact class of bug this gate cannot
  // afford, and the reason `actionSegments` exists rather than a regex over the raw slug.
  return segments.some((segment) => (READ_VERBS as readonly string[]).includes(segment)) ? "read" : "write";
}

/** True when running this action needs the learner's click first. Mirrors `heldForConfirmation`. */
export function heldForApproval(action: string, confirmed: boolean): boolean {
  return !confirmed && riskOf(action) === "write";
}

/**
 * What a held action returns to the model.
 *
 * 🔴 SAME SHAPE AS `pendingDeleteResult` (`confirm_required`, `instruction`), because the chat
 * surface already knows how to render that and a second shape would be a second card nobody
 * styled. The model is told plainly that nothing has happened yet — a model that believes the
 * email went out will say so, and the learner will believe it.
 */
export function pendingActionResult(pending: PendingAction) {
  return {
    confirm_required: true as const,
    instruction:
      `Nothing has happened yet. Tell the learner what you are about to do in ${pending.app} and ` +
      "wait for them to confirm. Do not say it is done, and do not try again until they agree.",
    pending_action: pending,
  };
}

export interface PendingAction {
  /** The connected app, as the learner named it when they connected it. */
  readonly app: string;
  /** The action slug, so approving re-runs exactly this and not something reconstructed. */
  readonly action: string;
  /** One line the learner reads before deciding. Built from the arguments, never from the model. */
  readonly summary: string;
  /**
   * The arguments it was called with, re-invoked verbatim on approval.
   *
   * 🔴🔴 ADDED 2026-08-25, AND WITHOUT IT AN APPROVAL WAS UNIMPLEMENTABLE. `PendingDelete` has
   * carried its `args` since the day it was written, for the reason stated on that field: a card
   * that describes one thing and performs another turns a click from consent into a rubber stamp.
   * This type was missing the same field, so the only way to act on an approval would have been to
   * ask the model to reissue the call — which is asking the thing being gated to restate what it
   * is allowed to do. The recipients on the card have to be the recipients in the request.
   *
   * 🔴 OPTIONAL ONLY FOR THE WIRE. The server echoes this object back to the browser, and a payload
   * written by an older build has no such field; treating that as `{}` and refusing to send is
   * safer than trusting a reconstruction. Every producer in this repo sets it.
   */
  readonly arguments?: Record<string, unknown>;
}

/**
 * The one-line summary a learner approves.
 *
 * 🔴🔴 BUILT FROM THE ARGUMENTS THE TOOL WAS ACTUALLY CALLED WITH, NEVER FROM THE MODEL'S PROSE.
 * A confirmation card describing something other than what will run is worse than no card: it
 * converts the learner's click from consent into a rubber stamp. So this reads the argument
 * object and says what is in it.
 *
 * 🔴 AND IT NAMES RECIPIENTS FIRST WHERE THERE ARE ANY. "Send an email" and "send an email to
 * 340 people" deserve very different reactions, and only one of them is visible by default.
 */
export function summarise(action: string, args: Record<string, unknown>): string {
  const verb = actionSegments(action).slice(1).join(" ").toLowerCase() || "run an action";
  const recipients = recipientsIn(args);
  if (recipients.length > 0) {
    const shown = recipients.slice(0, 3).join(", ");
    const rest = recipients.length > 3 ? ` and ${recipients.length - 3} more` : "";
    return `${verb}: ${shown}${rest}`;
  }
  const subject = firstString(args, ["subject", "title", "name", "summary", "query"]);
  return subject ? `${verb}: ${subject}` : verb;
}

function recipientsIn(args: Record<string, unknown>): readonly string[] {
  const out: string[] = [];
  for (const key of ["to", "recipient", "recipients", "cc", "bcc", "attendees"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) out.push(value.trim());
    else if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === "string" && entry.trim()) out.push(entry.trim());
    }
  }
  return out;
}

function firstString(args: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
  }
  return "";
}
