import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildWatchDigest } from "./watch-digest.ts";
import type { WatchEvent } from "./watch-events.ts";

function ev(partial: Partial<WatchEvent> & Pick<WatchEvent, "id" | "title">): WatchEvent {
  return {
    channel: "evidence",
    source_key: `pubmed_oa:${partial.id}`,
    is_alert: false,
    alert_reason: null,
    url: null,
    provider: "pubmed_oa",
    study_type: null,
    published_date: null,
    summary: null,
    detected_at: "2026-06-18T00:00:00Z",
    read_at: null,
    ...partial,
  };
}

const UNSUB = "https://app.pharmaorb.app/unsubscribe?token=abc";

Deno.test("buildWatchDigest returns null when there are no LOUD alerts (email is alerts-only)", () => {
  const out = buildWatchDigest({
    groups: [{
      watchTitle: "Semaglutide — CV outcomes",
      events: [
        ev({ id: "1", title: "A feed paper", is_alert: false }),
        ev({ id: "2", title: "In the news item", channel: "news", source_key: "news:https://x" }),
      ],
    }],
    unsubscribeUrl: UNSUB,
  });
  assertEquals(out, null);
});

Deno.test("buildWatchDigest builds subject/html/text/counts for one retraction alert", () => {
  const out = buildWatchDigest({
    groups: [{
      watchTitle: "Lecanemab in early Alzheimer disease",
      watchUrl: "https://app.pharmaorb.app/app/monitor/w1",
      events: [
        ev({ id: "9", title: "Pivotal trial RETRACTED", is_alert: true, alert_reason: "retraction", url: "https://pubmed.ncbi.nlm.nih.gov/9/" }),
      ],
    }],
    unsubscribeUrl: UNSUB,
  });
  assert(out !== null);
  assertEquals(out.alertCount, 1);
  assertEquals(out.watchCount, 1);
  assert(out.subject.includes("1 new alert"));
  // both bodies carry the alert + a human reason label + the watch title (no special chars → identical raw)
  for (const body of [out.html, out.text]) {
    assert(body.includes("Pivotal trial RETRACTED"), "alert title present");
    assert(body.includes("Retraction"), "reason label present");
    assert(body.includes("Lecanemab in early Alzheimer disease"), "watch title present");
    assert(body.includes(UNSUB), "unsubscribe link present (CAN-SPAM)");
  }
});

Deno.test("buildWatchDigest aggregates across watches, labels new-study alerts, counts feed as 'more updates'", () => {
  const out = buildWatchDigest({
    groups: [
      {
        watchTitle: "SGLT2 in heart failure",
        events: [
          ev({ id: "10", title: "New RCT", is_alert: true, alert_reason: "new_high_tier_study" }),
          ev({ id: "11", title: "A quiet feed paper", is_alert: false }),
          ev({ id: "12", title: "News headline", channel: "news", source_key: "news:https://y" }),
        ],
      },
      {
        watchTitle: "Metformin and longevity",
        events: [ev({ id: "20", title: "Meta-analysis published", is_alert: true, alert_reason: "new_high_tier_study" })],
      },
    ],
    unsubscribeUrl: UNSUB,
  });
  assert(out !== null);
  assertEquals(out.alertCount, 2);
  assertEquals(out.watchCount, 2);
  assert(out.subject.includes("2 new alerts"));
  assert(out.subject.includes("2 watch"));
  // the quiet feed paper is summarized as a count, never listed as an alert; news never appears at all
  assert(out.text.includes("New high-tier study"));
  assert(!out.text.includes("News headline"), "walled news is never emailed");
  assert(!out.html.includes("News headline"), "walled news is never emailed (html)");
  assert(out.text.includes("1 more update") || out.text.includes("1 more"), "feed surfaced as a count nudge");
});

Deno.test("buildWatchDigest escapes HTML in titles (the email body is untrusted source text)", () => {
  const out = buildWatchDigest({
    groups: [{
      watchTitle: "X & Y",
      events: [ev({ id: "30", title: `<script>alert(1)</script> & "quotes"`, is_alert: true, alert_reason: "retraction" })],
    }],
    unsubscribeUrl: UNSUB,
  });
  assert(out !== null);
  assert(!out.html.includes("<script>"), "raw script tag must not reach the HTML body");
  assert(out.html.includes("&lt;script&gt;"), "title is HTML-escaped");
  assert(out.html.includes("X &amp; Y"), "watch title is HTML-escaped");
  // plaintext keeps the raw characters (no escaping needed there)
  assert(out.text.includes("<script>alert(1)</script>"));
});

Deno.test("buildWatchDigest neutralizes a non-http(s) URL scheme in the HTML href", () => {
  const out = buildWatchDigest({
    groups: [{
      watchTitle: "W",
      events: [ev({ id: "50", title: "evil link", is_alert: true, alert_reason: "new_high_tier_study", url: "javascript:alert(1)" })],
    }],
    unsubscribeUrl: UNSUB,
  });
  assert(out !== null);
  assert(!out.html.includes("javascript:"), "a javascript: URI must never become a live href");
  assert(out.html.includes(`href="#"`), "unsafe scheme falls back to #");
});

Deno.test("buildWatchDigest excludes watches that have no alert this period", () => {
  const out = buildWatchDigest({
    groups: [
      { watchTitle: "Has an alert", events: [ev({ id: "40", title: "RCT", is_alert: true, alert_reason: "new_high_tier_study" })] },
      { watchTitle: "Quiet watch", events: [ev({ id: "41", title: "feed only", is_alert: false })] },
    ],
    unsubscribeUrl: UNSUB,
  });
  assert(out !== null);
  assertEquals(out.watchCount, 1);
  assert(!out.text.includes("Quiet watch"), "a watch with no alert is omitted from the digest");
});
