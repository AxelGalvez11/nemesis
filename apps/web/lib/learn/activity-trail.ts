// What a turn actually DID, as a list a learner can open: the documents it read, the searches it
// ran, the apps it used, the lookups it made. And the sentence it wrote before doing any of it.
//
// 🔴🔴 OWNER, 2026-09-04, WITH CHATGPT'S DESKTOP APP ON SCREEN: *"it will tell you like what it's
// gonna do, or reiterate things before it goes and does things. And as you can see here, the
// thinking preview is hidden, and when you unhide it, it shows like it's running commands, it's
// searching web, with like an icon or favicon. So can we have that for Nemesis too, rather than
// just having like a thinking preview."* Theirs: a paragraph in the model's own words ("No further
// questions — I understand. You want…"), then one collapsed line ("Used Net.ankiweb.anki
// integration, read files, ran commands, searched the web ⌄") that opens into the steps, each
// with the icon of the thing that did it, and then the answer.
//
// 🔴🔴 EVERY STEP HERE IS SOMETHING THAT HAPPENED, REPORTED BY THE CODE THAT DID IT. This is the
// rule `turn-preview.ts` set for the caption and it holds for the list: a search step is written
// when the request goes out and finished when the results land; an app step is written by the
// tool runner; a read step by retrieval. Nothing is written from a plan, and a model that said it
// would search on a turn that never did leaves no search in the trail.
//
// 🔴 THE PLAN IS THE ONE THING THE MODEL WRITES, AND IT IS BOUNDED THE WAY A MILESTONE IS. Same
// banned shapes (no percentages, no step numbers, no token counts, none of our vocabulary), and a
// plan that claims a search on a turn that bought none is refused whole. It is shown the moment
// the decision is read and kept as the first thing above the answer, which is where ChatGPT puts
// it.
//
// 🔴 IT IS STORED WITH THE TURN, WHICH REVERSES `canvas-moment.ts`'S "SYSTEM ACTIVITY IS ABSENT ON
// PURPOSE". That rule was the owner's on 2026-08-21 (*"transient"*); this is the owner's on
// 2026-09-04, pointing at a transcript where every old turn still opens to what it did. Capped
// hard so a reopened conversation costs a few hundred bytes a turn, never a log.
//
// PURE. No React, no I/O, no clock.

/** The most steps one turn keeps. A turn that did more did the same kinds of thing more times. */
export const MAX_ACTIVITY_STEPS = 24;
/** The longest any text on a step may be. A query or a label, never a passage. */
export const MAX_ACTIVITY_TEXT = 160;
/** The most site hosts kept on one search step: the favicons, not the results. */
export const MAX_ACTIVITY_SITES = 6;
/** The most document titles kept on one read step. */
export const MAX_ACTIVITY_TITLES = 6;
/** The longest a plan may be: two sentences, in the learner's terms. */
export const MAX_PLAN_LENGTH = 320;

export type ActivityStep =
  /** The learner's own documents this turn drew on. */
  | { readonly id: string; readonly kind: "read"; readonly titles: readonly string[]; readonly count: number }
  /** A web search: the query, the hosts it read from, how many pages it stands on. */
  | { readonly id: string; readonly kind: "search"; readonly query: string; readonly sites: readonly string[]; readonly count: number | null; readonly done: boolean }
  /** The literature indexes, fanned out once. */
  | { readonly id: string; readonly kind: "papers"; readonly count: number | null; readonly done: boolean }
  /** A connected app doing something, in the tool runner's own words. `appKey` is the slug the
   *  app's logo is keyed by (app-logos.ts); absent for Nemesis's own tools, which have no logo. */
  | { readonly id: string; readonly kind: "app"; readonly app: string; readonly appKey?: string; readonly label: string; readonly done: boolean }
  /** A lookup or a computation the runtime made: a compound, a curve, a figure. */
  | { readonly id: string; readonly kind: "work"; readonly label: string; readonly done: boolean };

export interface ActivityTrail {
  /** What the model said it understood and was about to do, or null when it said nothing. */
  readonly plan: string | null;
  readonly steps: readonly ActivityStep[];
  /** How long the turn worked, in seconds. 0 while it still is. */
  readonly seconds: number;
}

export const EMPTY_TRAIL: ActivityTrail = { plan: null, seconds: 0, steps: [] };

/** Whether there is anything to draw: a plan alone is not a trail, and neither is nothing. */
export function trailHasSteps(trail: ActivityTrail | null | undefined): trail is ActivityTrail {
  return Boolean(trail && trail.steps.length > 0);
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, limit) : "";
}

/**
 * A step added, or replaced by id when it is the same step reporting again.
 *
 * 🔴 UPSERT, NOT APPEND, because a search is two events: the request going out and the results
 * landing. One step, updated, is what a learner watching the list expects; two rows for one search
 * would count every search twice.
 */
export function upsertStep(steps: readonly ActivityStep[], step: ActivityStep): ActivityStep[] {
  const at = steps.findIndex((existing) => existing.id === step.id);
  if (at !== -1) return steps.map((existing, index) => (index === at ? step : existing));
  if (steps.length >= MAX_ACTIVITY_STEPS) return [...steps];
  return [...steps, step];
}

/** Every step still running marked finished: the turn is over, whatever it was waiting on. */
export function settleSteps(steps: readonly ActivityStep[]): ActivityStep[] {
  return steps.map((step) => ("done" in step && !step.done ? { ...step, done: true } : step));
}

/** Shapes a plan may never take: the same list `turn-preview.ts` refuses in a milestone. */
const BANNED: readonly RegExp[] = [
  /\d+\s*%/,
  /\bstep\s*\d/i,
  /\b\d+\s*(?:tokens?|ms)\b/i,
  /\b(?:prompt|token|endpoint|api|json|parse|payload|model call)\b/i,
];

const CLAIMS_SEARCH = /\b(search(es|ing)?|look(ing|s)? (it )?up|web|online|brows(e|ing)|check(ing)? (the )?(current|latest))\b/i;

/**
 * The plan this turn may show, or null.
 *
 * 🔴 REFUSED WHOLE, NEVER TRIMMED INTO SHAPE. A plan is one or two sentences; cutting the one that
 * mentions a percentage would leave half a thought above the answer.
 */
export function readPlan(value: unknown, context: { searching: boolean; tools: boolean }): string | null {
  const plan = text(value, MAX_PLAN_LENGTH + 1);
  if (!plan || plan.length > MAX_PLAN_LENGTH) return null;
  if (BANNED.some((pattern) => pattern.test(plan))) return null;
  if (!context.searching && CLAIMS_SEARCH.test(plan)) return null;
  void context.tools;
  return plan;
}

/**
 * The collapsed line: what kinds of thing the turn did, in ChatGPT's own grammar.
 *
 *     Used Google Calendar, read 2 files, searched the web
 *
 * 🔴 KINDS, NOT STEPS. Three searches are "searched the web" once; the steps themselves are one
 * press away. The order is theirs (apps, files, lookups, web, papers), fixed rather than
 * chronological, so the line reads the same for the same turn however the work interleaved.
 */
export function activitySummary(steps: readonly ActivityStep[]): string {
  const apps = [...new Set(steps.filter((step): step is Extract<ActivityStep, { kind: "app" }> => step.kind === "app").map((step) => step.app))];
  const files = steps.filter((step): step is Extract<ActivityStep, { kind: "read" }> => step.kind === "read").reduce((sum, step) => sum + step.count, 0);
  const work = steps.some((step) => step.kind === "work");
  const searched = steps.some((step) => step.kind === "search");
  const papers = steps.some((step) => step.kind === "papers");
  const parts: string[] = [];
  if (apps.length === 1) parts.push(`used ${apps[0]}`);
  else if (apps.length === 2) parts.push(`used ${apps[0]} and ${apps[1]}`);
  else if (apps.length > 2) parts.push(`used ${apps.length} apps`);
  if (files === 1) parts.push("read 1 file");
  else if (files > 1) parts.push(`read ${files} files`);
  if (work) parts.push("looked things up");
  if (searched) parts.push("searched the web");
  if (papers) parts.push("checked the literature");
  if (parts.length === 0) return "";
  const line = parts.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** One step, as the list draws it: the sentence beside its icon. */
export function stepLabel(step: ActivityStep): string {
  switch (step.kind) {
    case "read":
      return step.titles.length === 1 && step.count === 1
        ? `Read ${step.titles[0]}`
        : step.titles.length > 0 && step.count > step.titles.length
          ? `Read ${step.titles.join(", ")} and ${step.count - step.titles.length} more`
          : step.titles.length > 0
            ? `Read ${step.titles.join(", ")}`
            : `Read ${step.count} ${step.count === 1 ? "file" : "files"}`;
    case "search":
      return step.done ? `Searched the web for ${step.query}` : `Searching the web for ${step.query}`;
    case "papers":
      return step.done
        ? step.count === null
          ? "Checked the literature"
          : `Checked the literature, ${step.count} ${step.count === 1 ? "paper" : "papers"}`
        : "Checking the literature";
    case "app":
      return step.label;
    case "work":
      return step.label;
  }
}

/** The stored shape: what a moment keeps. Strings capped, nothing runtime. */
export interface StoredActivity {
  readonly plan?: string;
  readonly steps: readonly ActivityStep[];
  readonly seconds: number;
}

/** A trail cut to what a moment may carry. Null when there is nothing worth keeping. */
export function serializeActivity(trail: ActivityTrail | null | undefined): StoredActivity | null {
  if (!trail || trail.steps.length === 0) return null;
  const steps = settleSteps(trail.steps).slice(0, MAX_ACTIVITY_STEPS).map((step): ActivityStep => {
    switch (step.kind) {
      case "read":
        return { count: Math.max(0, Math.floor(step.count)), id: step.id, kind: "read", titles: step.titles.slice(0, MAX_ACTIVITY_TITLES).map((title) => text(title, MAX_ACTIVITY_TEXT)) };
      case "search":
        return { count: step.count, done: true, id: step.id, kind: "search", query: text(step.query, MAX_ACTIVITY_TEXT), sites: step.sites.slice(0, MAX_ACTIVITY_SITES).map((site) => text(site, 80)) };
      case "papers":
        return { count: step.count, done: true, id: step.id, kind: "papers" };
      case "app":
        return { app: text(step.app, 60), ...(step.appKey ? { appKey: text(step.appKey, 60) } : {}), done: true, id: step.id, kind: "app", label: text(step.label, MAX_ACTIVITY_TEXT) };
      case "work":
        return { done: true, id: step.id, kind: "work", label: text(step.label, MAX_ACTIVITY_TEXT) };
    }
  });
  const plan = trail.plan ? text(trail.plan, MAX_PLAN_LENGTH) : "";
  return { ...(plan ? { plan } : {}), seconds: Math.max(0, Math.round(trail.seconds * 10) / 10), steps };
}

/**
 * A stored trail read back without trusting it: a moment is learner data in a JSON blob, and a row
 * written by a future version, or by hand, must never take the thread down.
 */
export function readActivity(raw: unknown): ActivityTrail | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const steps: ActivityStep[] = [];
  for (const entry of Array.isArray(value.steps) ? value.steps : []) {
    if (steps.length >= MAX_ACTIVITY_STEPS) break;
    if (!entry || typeof entry !== "object") continue;
    const step = entry as Record<string, unknown>;
    const id = text(step.id, 64) || `s${steps.length + 1}`;
    switch (step.kind) {
      case "read": {
        const titles = (Array.isArray(step.titles) ? step.titles : []).map((title) => text(title, MAX_ACTIVITY_TEXT)).filter(Boolean).slice(0, MAX_ACTIVITY_TITLES);
        const count = typeof step.count === "number" && Number.isFinite(step.count) ? Math.max(titles.length, Math.floor(step.count)) : titles.length;
        if (count > 0) steps.push({ count, id, kind: "read", titles });
        break;
      }
      case "search": {
        const query = text(step.query, MAX_ACTIVITY_TEXT);
        if (!query) break;
        const sites = (Array.isArray(step.sites) ? step.sites : []).map((site) => text(site, 80)).filter(Boolean).slice(0, MAX_ACTIVITY_SITES);
        const count = typeof step.count === "number" && Number.isFinite(step.count) ? Math.max(0, Math.floor(step.count)) : null;
        steps.push({ count, done: true, id, kind: "search", query, sites });
        break;
      }
      case "papers": {
        const count = typeof step.count === "number" && Number.isFinite(step.count) ? Math.max(0, Math.floor(step.count)) : null;
        steps.push({ count, done: true, id, kind: "papers" });
        break;
      }
      case "app": {
        const app = text(step.app, 60);
        const label = text(step.label, MAX_ACTIVITY_TEXT);
        const appKey = text(step.appKey, 60);
        if (app && label) steps.push({ app, ...(appKey ? { appKey } : {}), done: true, id, kind: "app", label });
        break;
      }
      case "work": {
        const label = text(step.label, MAX_ACTIVITY_TEXT);
        if (label) steps.push({ done: true, id, kind: "work", label });
        break;
      }
      default:
        break;
    }
  }
  if (steps.length === 0) return null;
  const plan = text(value.plan, MAX_PLAN_LENGTH);
  const seconds = typeof value.seconds === "number" && Number.isFinite(value.seconds) ? Math.max(0, value.seconds) : 0;
  return { plan: plan || null, seconds, steps };
}
