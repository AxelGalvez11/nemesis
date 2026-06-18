import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fetchGoogleNews,
  googleNewsSearchUrl,
  newsKey,
  type NewsItem,
  parseGoogleNewsRss,
} from "./news-source.ts";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>"semaglutide" - Google News</title>
  <item>
    <title>Tirzepatide outperforms semaglutide &amp; older drugs in head-to-head trial - Reuters</title>
    <link>https://news.google.com/rss/articles/abc123</link>
    <guid>tag:news,abc123</guid>
    <pubDate>Mon, 16 Jun 2026 10:30:00 GMT</pubDate>
    <source url="https://www.reuters.com">Reuters</source>
  </item>
  <item>
    <title><![CDATA[Patients ask: is it &#39;safe&#39;? - STAT]]></title>
    <link>https://news.google.com/rss/articles/def456</link>
    <pubDate>Tue, 17 Jun 2026 08:00:00 GMT</pubDate>
    <source url="https://www.statnews.com">STAT</source>
  </item>
  <item>
    <title>Item with no link should be skipped - Nowhere</title>
    <pubDate>Wed, 18 Jun 2026 08:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

Deno.test("googleNewsSearchUrl builds an encoded RSS search URL", () => {
  const url = googleNewsSearchUrl("semaglutide weight loss");
  assert(url.includes("news.google.com/rss/search"));
  assert(url.includes("semaglutide%20weight%20loss") || url.includes("semaglutide+weight+loss"));
});

Deno.test("parseGoogleNewsRss extracts items, decodes entities, normalizes the date", () => {
  const items = parseGoogleNewsRss(FIXTURE);
  assertEquals(items.length, 2); // the link-less third item is skipped
  assertEquals(items[0].title, "Tirzepatide outperforms semaglutide & older drugs in head-to-head trial - Reuters");
  assertEquals(items[0].url, "https://news.google.com/rss/articles/abc123");
  assertEquals(items[0].source, "Reuters");
  assertEquals(items[0].published_at, "2026-06-16T10:30:00.000Z");
});

Deno.test("parseGoogleNewsRss handles CDATA + numeric entities", () => {
  const items = parseGoogleNewsRss(FIXTURE);
  assertEquals(items[1].title, "Patients ask: is it 'safe'? - STAT");
  assertEquals(items[1].source, "STAT");
});

Deno.test("a NewsItem is feed metadata only — NOT an evidence record (the wall)", () => {
  const items = parseGoogleNewsRss(FIXTURE);
  // No provider / provider_id / license / content_hash / content_text — it can never be mistaken
  // for a NormalizedSource / Citation, so it can never enter the citation namespace or grounding.
  assertEquals(Object.keys(items[0]).sort(), ["published_at", "source", "title", "url"]);
});

Deno.test("newsKey is URL-based and stable across cycles", () => {
  const item: NewsItem = {
    title: "x",
    url: "https://news.google.com/rss/articles/abc123",
    source: "Reuters",
    published_at: null,
  };
  assertEquals(newsKey(item), "news:https://news.google.com/rss/articles/abc123");
});

Deno.test("parseGoogleNewsRss is empty/tolerant on junk input", () => {
  assertEquals(parseGoogleNewsRss(""), []);
  assertEquals(parseGoogleNewsRss("<rss><channel></channel></rss>"), []);
});

Deno.test("fetchGoogleNews returns parsed items on a 200 (injected fetch)", async () => {
  const fakeFetch = (_url: string) => Promise.resolve(new Response(FIXTURE, { status: 200 }));
  const items = await fetchGoogleNews({ query: "semaglutide", fetchImpl: fakeFetch });
  assertEquals(items.length, 2);
});

Deno.test("fetchGoogleNews is fault-tolerant: a failing fetch yields [] (never throws)", async () => {
  const boom = (_url: string) => Promise.reject(new Error("network down"));
  assertEquals(await fetchGoogleNews({ query: "semaglutide", fetchImpl: boom }), []);
  const notOk = (_url: string) => Promise.resolve(new Response("nope", { status: 503 }));
  assertEquals(await fetchGoogleNews({ query: "semaglutide", fetchImpl: notOk }), []);
});

Deno.test("fetchGoogleNews skips the network on an empty query", async () => {
  let called = false;
  const spy = (_url: string) => {
    called = true;
    return Promise.resolve(new Response(FIXTURE, { status: 200 }));
  };
  assertEquals(await fetchGoogleNews({ query: "   ", fetchImpl: spy }), []);
  assert(!called);
});
