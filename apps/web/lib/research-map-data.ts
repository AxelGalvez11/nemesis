"use client";
// Assembles the per-project Research Map data: fetches each item's citations (chats via their saved
// turns + any embedded deep-research report; reports directly; watches via their evidence events),
// then hands the collected shape to the pure buildResearchMap aggregator. Per-item failures degrade
// (skip + count) so one unreadable chat never blanks the map. Concurrency-capped at 4 to stay gentle
// on the RLS-scoped browser client. Seeds from an in-memory cache for an instant re-paint.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Citation } from "@nemesis/shared";
import {
  buildResearchMap,
  type ResearchMap,
  type ResearchMapInput,
  type ResearchMapItemCites,
  type ResearchMapWatch,
} from "@nemesis/shared";
import {
  fetchConversationTurns,
  fetchResearchReport,
  fetchWatchEvents,
  type ProjectContents,
} from "@/lib/api";
import { getCached, setCached } from "@/lib/cache";

export interface ResearchMapState {
  map: ResearchMap | null;
  loading: boolean;
  error: string | null;
  /** How many items were skipped because their citation fetch failed. */
  skipped: number;
  refresh: () => void;
}

/** Run tasks with a fixed concurrency ceiling, preserving input order in the output. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Gather a chat's citations from its inline answers plus any embedded deep-research report. */
async function chatCitations(chatId: string): Promise<Citation[]> {
  const turns = await fetchConversationTurns(chatId);
  const out: Citation[] = [];
  const reportIds: string[] = [];
  for (const t of turns) {
    if (t.a?.citations?.length) out.push(...t.a.citations);
    if (t.research?.savedReportId) reportIds.push(t.research.savedReportId);
  }
  for (const rid of reportIds) {
    const report = await fetchResearchReport(rid);
    if (report?.citations?.length) out.push(...report.citations);
  }
  return out;
}

export function useResearchMapData(projectId: string, contents: ProjectContents | null): ResearchMapState {
  const cacheKey = `map:${projectId}`;
  const [map, setMap] = useState<ResearchMap | null>(() => getCached<ResearchMap>(cacheKey) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  useEffect(() => {
    if (!contents) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      let failures = 0;
      const settle = async <T,>(id: string, load: () => Promise<T>, empty: T): Promise<T> => {
        try {
          return await load();
        } catch {
          failures++;
          return empty;
        }
      };

      const chats = await mapWithLimit(contents.chats, 4, async (c): Promise<ResearchMapItemCites> => ({
        id: c.id,
        title: c.title,
        citations: await settle(c.id, () => chatCitations(c.id), []),
      }));
      const reports = await mapWithLimit(contents.reports, 4, async (r): Promise<ResearchMapItemCites> => ({
        id: r.id,
        title: r.title,
        citations: await settle(r.id, async () => (await fetchResearchReport(r.id))?.citations ?? [], []),
      }));
      const watches = await mapWithLimit(contents.watches, 4, async (w): Promise<ResearchMapWatch> => ({
        id: w.id,
        title: w.title,
        events: await settle(w.id, async () => {
          const events = await fetchWatchEvents(w.id);
          return events.map((e) => ({
            source_key: e.source_key,
            url: e.url,
            title: e.title,
            channel: e.channel,
            published_date: e.published_date,
            study_type: e.study_type,
          }));
        }, []),
      }));

      if (cancelled || !aliveRef.current) return;
      const input: ResearchMapInput = { chats, reports, watches };
      const built = buildResearchMap(input);
      setCached(cacheKey, built);
      setMap(built);
      setSkipped(failures);
      setLoading(false);
    })().catch((e) => {
      if (cancelled || !aliveRef.current) return;
      setError(e instanceof Error ? e.message : "Could not build the map.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [contents, cacheKey, tick]);

  return { map, loading, error, skipped, refresh };
}
