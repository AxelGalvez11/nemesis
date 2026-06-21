// Watch-check orchestration core — PURE, deterministic. The "brain" of one watch cycle:
// given what the dated source queries returned (evidence + news) and what the watch already
// knew, compute the evidence delta (new sources + loud conclusion-mover alerts) and the news
// delta (feed-only). Composes the two detectors built earlier; the edge function (index.ts)
// supplies the real fetches + DB persistence and stays thin.
//
// The two channels stay separate here too: evidence flows through detectWatchDelta (which can
// raise alerts); news flows through detectNewsDelta (feed-only, never an alert) — the wall.

import {
  detectWatchDelta,
  type WatchDelta,
  type WatchSource,
} from "../../../packages/shared/src/watch-detect.ts";
import { type NewsItem, newsKey } from "../news/news-source.ts";

/** The news-channel analogue of WatchDelta — no alerts (news never moves a conclusion). */
export interface NewsDelta {
  readonly baseline: boolean;
  readonly newItems: NewsItem[];
  readonly knownKeysAfter: string[];
}

/** Structural subset of a LiveCandidate (ask/live-sources.ts) — kept local so this module does
 *  not hard-depend on the ask engine. The watch-check passes real LiveCandidates, which are
 *  assignable to this shape. */
export interface LiveCandidateLike {
  provider: string;
  provider_id: string;
  title?: string;
  url?: string;
  source?: { metadata?: Record<string, unknown>; effective_at?: string };
}

/** Adapt a live-evidence candidate to the WatchSource the detector needs, lifting the study-type
 *  metadata the providers already capture (mirrors liveToChunk in ask/live-sources.ts). */
export function liveCandidateToWatchSource(c: LiveCandidateLike): WatchSource {
  const m = c.source?.metadata ?? {};
  const strArr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : undefined;
  const str = (v: unknown): string | undefined => {
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
    return undefined;
  };
  const phases = strArr(m.phases);
  return {
    provider: c.provider,
    provider_id: c.provider_id,
    title: c.title,
    url: c.url,
    published_date: c.source?.effective_at ? c.source.effective_at.slice(0, 10) : null,
    publication_types: strArr(m.publication_types),
    study_type: str(m.study_type),
    trial_phase: phases && phases.length ? phases[phases.length - 1] : undefined,
  };
}

/** News seen-set diff: same cold-start + accumulation discipline as the evidence detector, but
 *  feed-only (no material classification — news never raises a loud alert). Keyed by `newsKey`. */
export function detectNewsDelta(args: {
  items: readonly NewsItem[];
  knownKeys: readonly string[];
  firstRun: boolean;
}): NewsDelta {
  const known = new Set(args.knownKeys);
  const seen = new Set<string>();
  const unique: NewsItem[] = [];
  for (const it of args.items) {
    const key = newsKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(it);
  }
  const knownKeysAfter = [...new Set([...args.knownKeys, ...seen])];
  if (args.firstRun) return { baseline: true, newItems: [], knownKeysAfter };
  return {
    baseline: false,
    newItems: unique.filter((it) => !known.has(newsKey(it))),
    knownKeysAfter,
  };
}

/** Run one watch cycle: evidence (with alerts) + news (feed-only), each diffed against its own
 *  accumulating known-set. firstRun baselines BOTH channels silently (no back-catalogue spam). */
export function runWatchCycle(args: {
  evidenceSources: readonly WatchSource[];
  newsItems: readonly NewsItem[];
  knownEvidenceKeys: readonly string[];
  knownNewsKeys: readonly string[];
  firstRun: boolean;
}): { evidence: WatchDelta; news: NewsDelta } {
  return {
    evidence: detectWatchDelta({
      fetched: args.evidenceSources,
      knownKeys: args.knownEvidenceKeys,
      firstRun: args.firstRun,
    }),
    news: detectNewsDelta({
      items: args.newsItems,
      knownKeys: args.knownNewsKeys,
      firstRun: args.firstRun,
    }),
  };
}
