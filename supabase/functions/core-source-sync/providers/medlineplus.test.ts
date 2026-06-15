import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeMedlineTopic, parseMedlinePlusXml, topicSlug } from "./medlineplus.ts";

// A trimmed but faithful slice of the real wsearch.nlm.nih.gov response (the highlight markup is
// double-layered: the HTML tags are themselves XML-escaped, so &lt;p&gt; must decode to <p> and then
// the tag is stripped — the qt0 spans are search-term highlights, not content).
const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<nlmSearchResult>
  <term>heartburn</term>
  <count>2</count>
  <list num="2" start="0" per="2">
    <document rank="0" url="https://medlineplus.gov/heartburn.html">
      <content name="title">&lt;span class="qt0"&gt;Heartburn&lt;/span&gt;</content>
      <content name="organizationName">National Library of Medicine</content>
      <content name="altTitle">Acid Reflux</content>
      <content name="altTitle">Pyrosis</content>
      <content name="FullSummary">&lt;p&gt;&lt;span class="qt0"&gt;Heartburn&lt;/span&gt; is a painful burning feeling in your chest.&lt;/p&gt;&lt;p&gt;Over-the-counter medicines may help.&lt;/p&gt;</content>
      <content name="groupName">Digestive System</content>
      <content name="snippet">Heartburn is a painful burning ...</content>
    </document>
    <document rank="1" url="https://medlineplus.gov/gerd.html">
      <content name="title">GERD</content>
      <content name="organizationName">National Library of Medicine</content>
      <content name="FullSummary">&lt;p&gt;GERD is a more serious, lasting form of acid reflux.&lt;/p&gt;</content>
    </document>
  </list>
</nlmSearchResult>`;

Deno.test("parseMedlinePlusXml: extracts each topic with decoded, tag-stripped title + summary", () => {
  const topics = parseMedlinePlusXml(FIXTURE);
  assertEquals(topics.length, 2);

  const hb = topics[0];
  assertEquals(hb.url, "https://medlineplus.gov/heartburn.html");
  assertEquals(hb.title, "Heartburn"); // qt0 span decoded + stripped
  // tags gone, entities decoded, paragraphs joined with a space, whitespace collapsed
  assertEquals(
    hb.summary,
    "Heartburn is a painful burning feeling in your chest. Over-the-counter medicines may help.",
  );
  assertEquals(hb.altTitles, ["Acid Reflux", "Pyrosis"]);
  assertEquals(hb.groups, ["Digestive System"]);
});

Deno.test("topicSlug: the medlineplus.gov page slug is the stable per-topic id", () => {
  assertEquals(topicSlug("https://medlineplus.gov/heartburn.html"), "heartburn");
  assertEquals(topicSlug("https://medlineplus.gov/gerd.html"), "gerd");
});

Deno.test("normalizeMedlineTopic: maps to a public-domain, storable NormalizedSource", async () => {
  const [hb] = parseMedlinePlusXml(FIXTURE);
  const src = await normalizeMedlineTopic(hb);
  assertExists(src);
  assertEquals(src!.provider, "medlineplus");
  assertEquals(src!.provider_id, "heartburn"); // dedupe key = topic slug
  assertEquals(src!.license, "nlm_public"); // NLM/NIH consumer-health terms -> commercial-friendly -> storable
  assertEquals(src!.source_url, "https://medlineplus.gov/heartburn.html");
  assertEquals(src!.content_text.startsWith("Heartburn"), true);
  assertEquals(src!.content_text.includes("Over-the-counter medicines may help."), true);
  assertExists(src!.content_hash);
});

Deno.test("normalizeMedlineTopic: returns null when title or summary is missing (nothing to ground)", async () => {
  assertEquals(await normalizeMedlineTopic({ url: "https://medlineplus.gov/x.html", title: "X", summary: "", altTitles: [], groups: [] }), null);
  assertEquals(await normalizeMedlineTopic({ url: "https://medlineplus.gov/x.html", title: "", summary: "Some text.", altTitles: [], groups: [] }), null);
});
