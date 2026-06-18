import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { partitionWatchEvents, watchTitleFromQuestion, type WatchEvent } from "./watch-events.ts";

Deno.test("watchTitleFromQuestion trims + collapses whitespace, keeps a short question as-is", () => {
  assertEquals(watchTitleFromQuestion("  semaglutide   cardiovascular  outcomes "), "semaglutide cardiovascular outcomes");
});

Deno.test("watchTitleFromQuestion truncates a long question with an ellipsis (<=120 chars)", () => {
  const long = "a".repeat(200);
  const title = watchTitleFromQuestion(long);
  assertEquals(title.length, 120);
  assertEquals(title.endsWith("…"), true);
});

Deno.test("watchTitleFromQuestion falls back to a placeholder for an empty question", () => {
  assertEquals(watchTitleFromQuestion("   "), "Untitled watch");
});

function ev(over: Partial<WatchEvent>): WatchEvent {
  return {
    id: over.id ?? crypto.randomUUID(),
    channel: "evidence",
    source_key: "pubmed_oa:1",
    is_alert: false,
    alert_reason: null,
    title: "A source",
    url: null,
    provider: "pubmed_oa",
    study_type: null,
    published_date: null,
    summary: null,
    detected_at: "2026-06-10T00:00:00.000Z",
    read_at: null,
    ...over,
  };
}

Deno.test("partitionWatchEvents splits into loud alerts, quiet evidence feed, and the walled news list", () => {
  const p = partitionWatchEvents([
    ev({ id: "a", is_alert: true, alert_reason: "new_high_tier_study", study_type: "Randomized controlled trial" }),
    ev({ id: "f", is_alert: false }),
    ev({ id: "n", channel: "news", source_key: "news:https://x", provider: "Reuters" }),
  ]);
  assertEquals(p.alerts.map((e) => e.id), ["a"]);
  assertEquals(p.feed.map((e) => e.id), ["f"]);
  assertEquals(p.news.map((e) => e.id), ["n"]);
});

Deno.test("partitionWatchEvents keeps news OUT of alerts even if a row were mislabeled (the wall is defensive)", () => {
  // The schema CHECK forbids news+is_alert, but the partition must NEVER route a news item into the
  // loud evidence alerts even if malformed data slipped through — alerts are evidence-only.
  const p = partitionWatchEvents([ev({ id: "bad", channel: "news", is_alert: true })]);
  assertEquals(p.alerts, []);
  assertEquals(p.news.map((e) => e.id), ["bad"]);
});

Deno.test("partitionWatchEvents orders every channel newest-first by detected_at", () => {
  const p = partitionWatchEvents([
    ev({ id: "old", detected_at: "2026-06-01T00:00:00.000Z" }),
    ev({ id: "new", detected_at: "2026-06-15T00:00:00.000Z" }),
    ev({ id: "mid", detected_at: "2026-06-08T00:00:00.000Z" }),
  ]);
  assertEquals(p.feed.map((e) => e.id), ["new", "mid", "old"]);
});

Deno.test("partitionWatchEvents counts only UNREAD alerts (the inbox badge)", () => {
  const p = partitionWatchEvents([
    ev({ id: "a1", is_alert: true, read_at: null }),
    ev({ id: "a2", is_alert: true, read_at: "2026-06-12T00:00:00.000Z" }), // already read
    ev({ id: "a3", is_alert: true, read_at: null }),
    ev({ id: "f1", is_alert: false, read_at: null }), // a feed item, not an alert
  ]);
  assertEquals(p.alerts.length, 3);
  assertEquals(p.unreadAlertCount, 2);
});

Deno.test("partitionWatchEvents on an empty watch returns all-empty channels", () => {
  const p = partitionWatchEvents([]);
  assertEquals(p, { alerts: [], feed: [], news: [], unreadAlertCount: 0 });
});
