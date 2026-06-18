// Client-facing watch event shape + the PURE presentation split for the watch detail view.
//
// A WatchEvent mirrors one watch_events row (the user-facing feed + alerts + news list). This module
// is the deterministic grouping the UI renders from — kept here (shared, unit-tested) rather than
// inline in a component so the channel split, the news WALL, and the unread-badge count are provable.
//
// THE WALL (enforced again here, defensively): the loud "alerts" lane is EVIDENCE-ONLY. Even if a news
// row ever arrived mislabeled is_alert=true (the schema CHECK forbids it), it is routed to the news
// list, never the alerts inbox — news is never a conclusion-mover.

export interface WatchEvent {
  id: string;
  channel: "evidence" | "news";
  source_key: string;
  is_alert: boolean;
  alert_reason: "new_high_tier_study" | "retraction" | null;
  title: string;
  url: string | null;
  provider: string | null;
  study_type: string | null; // the computed studyTypeLabel (e.g. "Randomized controlled trial")
  published_date: string | null;
  summary: string | null; // grounded change summary (alerts) — null until the summary increment
  detected_at: string; // ISO
  read_at: string | null;
}

export interface PartitionedWatchEvents {
  /** Loud, conclusion-mover alerts (evidence only): a new high-tier study or a retraction. */
  alerts: WatchEvent[];
  /** The quiet "what's new" feed: every other new evidence source. */
  feed: WatchEvent[];
  /** The walled-off "In the news — not verified evidence" list. */
  news: WatchEvent[];
  /** Unread alerts only — the inbox badge count. */
  unreadAlertCount: number;
}

/** Newest-first by detected_at. */
function byDetectedDesc(a: WatchEvent, b: WatchEvent): number {
  return a.detected_at < b.detected_at ? 1 : a.detected_at > b.detected_at ? -1 : 0;
}

/** Split a watch's events into the three render lanes, each newest-first, + the unread-alert badge. */
export function partitionWatchEvents(events: readonly WatchEvent[]): PartitionedWatchEvents {
  const alerts: WatchEvent[] = [];
  const feed: WatchEvent[] = [];
  const news: WatchEvent[] = [];
  for (const e of events) {
    if (e.channel === "news") news.push(e);
    else if (e.is_alert) alerts.push(e); // evidence + is_alert → loud
    else feed.push(e); // evidence, not an alert → quiet feed
  }
  alerts.sort(byDetectedDesc);
  feed.sort(byDetectedDesc);
  news.sort(byDetectedDesc);
  return { alerts, feed, news, unreadAlertCount: alerts.filter((e) => e.read_at === null).length };
}
