// Persistence PLAN for one watch cycle — PURE, deterministic, no DB/network.
//
// WHY THIS IS A PURE FUNCTION (advisor-mandated — the WS-F trap at the DB layer): the decision logic
// of a watch cycle (cold-start firstRun → silent baseline; which deltas become quiet feed events vs
// loud alerts; advance-the-cursor-only-on-success; store ONLY genuinely-new keys) is the part that
// actually matters and is easy to get wrong. Shipping that branching untested to a deploy gate is
// exactly the failure the dated-query probe just protected against. So it lives here, unit-tested
// offline, and the edge function (index.ts) only EXECUTES this plan as a few mechanical service-role
// writes. The plan carries plain row objects; index.ts maps them to upserts/inserts + one cursor UPDATE.
//
// Never-LLM-guess: every field here is a deterministic projection of the detector output + the
// computed study-type label. The grounded change SUMMARY (the only generated text) is increment 5 —
// it is null here, and when added will flow through the one safety scan before landing on an event.

import { sourceKey, type WatchDelta } from "../../../packages/shared/src/watch-detect.ts";
import { studyTypeLabel } from "../../../packages/shared/src/study-type.ts";
import type { NewsDelta } from "./watch-cycle.ts";
import { newsKey } from "../news/news-source.ts";

/** What the edge function already knows about the watch when it starts a cycle (loaded from the DB). */
export interface WatchState {
  watchId: string;
  userId: string;
  /** baselined_at IS NULL → the first-ever check baselines silently (explicit, not inferred). */
  firstRun: boolean;
  /** The accumulated known-source keys per channel (from watch_known_sources), to diff the upsert minimal. */
  priorKnownEvidenceKeys: readonly string[];
  priorKnownNewsKeys: readonly string[];
}

/** A row for watch_known_sources (the accumulating seen-set; PK (watch_id, channel, source_key)). */
export interface KnownSourceUpsert {
  watch_id: string;
  channel: "evidence" | "news";
  source_key: string;
}

/** A row for watch_events (the user-facing feed + alerts + news list). Mirrors the migration columns. */
export interface WatchEventInsert {
  watch_id: string;
  user_id: string;
  channel: "evidence" | "news";
  source_key: string;
  is_alert: boolean;
  alert_reason: string | null; // 'new_high_tier_study' | 'retraction' | null (CHECK enforces the set)
  title: string;
  url: string | null;
  provider: string | null;
  study_type: string | null; // the deterministic studyTypeLabel (e.g. "Randomized controlled trial")
  published_date: string | null; // YYYY-MM-DD
  summary: string | null; // grounded change summary — null until increment 5
}

export interface PersistencePlan {
  /** New seen-set rows to upsert (ON CONFLICT DO NOTHING). Only keys not already known — minimal writes. */
  keysToUpsert: KnownSourceUpsert[];
  /** Feed + alert rows to insert (ON CONFLICT (watch_id,channel,source_key) DO NOTHING). Empty on baseline. */
  eventsToInsert: WatchEventInsert[];
  /** last_checked_at advances to `now`. The caller applies this LAST, so a mid-cycle failure leaves the
   *  cursor unadvanced and the date-window re-covers the gap next run (idempotent catch-up). */
  cursorAdvanceTo: string;
  /** baselined_at: `now` on the first run (marks the silent baseline complete), else null (already set). */
  setBaselinedAt: string | null;
}

/** The YYYY-MM-DD date part of an ISO timestamp (news published_at), or null. */
function isoDatePart(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

/**
 * Turn one cycle's deltas into the exact rows the watch-check will write. Uniform across baseline and
 * normal cycles: keysToUpsert = (knownKeysAfter \ priorKnown) per channel, so the baseline stores its
 * whole fetch and a normal cycle stores only what's new (the overlap-window re-fetches dedupe to nothing).
 */
export function planPersistence(args: {
  state: WatchState;
  cycle: { evidence: WatchDelta; news: NewsDelta };
  now: string;
}): PersistencePlan {
  const { state, cycle, now } = args;

  // ── minimal seen-set growth: only keys not already known (per channel) ──
  const priorEvidence = new Set(state.priorKnownEvidenceKeys);
  const priorNews = new Set(state.priorKnownNewsKeys);
  const keysToUpsert: KnownSourceUpsert[] = [];
  for (const k of cycle.evidence.knownKeysAfter) {
    if (!priorEvidence.has(k)) keysToUpsert.push({ watch_id: state.watchId, channel: "evidence", source_key: k });
  }
  for (const k of cycle.news.knownKeysAfter) {
    if (!priorNews.has(k)) keysToUpsert.push({ watch_id: state.watchId, channel: "news", source_key: k });
  }

  // ── events: NONE on the silent baseline; one per genuinely-new source/item on a normal cycle ──
  const eventsToInsert: WatchEventInsert[] = [];
  if (!state.firstRun) {
    const alertByKey = new Map(cycle.evidence.alerts.map((a) => [sourceKey(a.source), a.reason]));
    for (const s of cycle.evidence.newSources) {
      const key = sourceKey(s);
      const reason = alertByKey.get(key) ?? null;
      eventsToInsert.push({
        watch_id: state.watchId,
        user_id: state.userId,
        channel: "evidence",
        source_key: key,
        is_alert: reason !== null,
        alert_reason: reason,
        title: s.title ?? key,
        url: s.url ?? null,
        provider: s.provider,
        study_type: studyTypeLabel(s) ?? null,
        published_date: s.published_date ?? null,
        summary: null,
      });
    }
    for (const it of cycle.news.newItems) {
      // THE WALL: a news item is feed-only — is_alert is HARD false, alert_reason null, no study-type.
      eventsToInsert.push({
        watch_id: state.watchId,
        user_id: state.userId,
        channel: "news",
        source_key: newsKey(it), // "news:<url>" — matches the news known-set key
        is_alert: false,
        alert_reason: null,
        title: it.title,
        url: it.url,
        provider: it.source || null, // the outlet
        study_type: null,
        published_date: isoDatePart(it.published_at),
        summary: null,
      });
    }
  }

  return {
    keysToUpsert,
    eventsToInsert,
    cursorAdvanceTo: now, // always advance on a completed cycle (the caller applies it last, on success)
    setBaselinedAt: state.firstRun ? now : null,
  };
}
