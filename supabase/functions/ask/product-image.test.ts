// deno test product-image.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dailyMedSplsUrl,
  dailyMedMediaUrl,
  parseSetid,
  parseMediaUrl,
  resolveProductImageUrl,
} from "./product-image.ts";

Deno.test("URL builders encode name + setid and target the right endpoints", () => {
  assertEquals(dailyMedSplsUrl("lisinopril").includes("drug_name=lisinopril"), true);
  assertEquals(dailyMedSplsUrl("insulin glargine").includes("insulin%20glargine"), true);
  assertEquals(dailyMedMediaUrl("abc-123").endsWith("/spls/abc-123/media.json"), true);
});

Deno.test("parseSetid takes the first result's setid, else null", () => {
  assertEquals(parseSetid({ data: [{ setid: "set-1" }, { setid: "set-2" }] }), "set-1");
  assertEquals(parseSetid({ data: [] }), null);
  assertEquals(parseSetid({}), null);
  assertEquals(parseSetid({ data: [{}] }), null);
  assertEquals(parseSetid(null), null);
});

Deno.test("parseMediaUrl takes the first http(s) media url, else null", () => {
  assertEquals(
    parseMediaUrl({ data: { media: [{ url: "https://dailymed.nlm.nih.gov/dailymed/image.cfm?x=1.jpg" }] } }),
    "https://dailymed.nlm.nih.gov/dailymed/image.cfm?x=1.jpg",
  );
  assertEquals(parseMediaUrl({ data: { media: [] } }), null);
  assertEquals(parseMediaUrl({ data: {} }), null);
  assertEquals(parseMediaUrl({ data: { media: [{ url: "ftp://nope" }] } }), null);
});

// Two-hop orchestration with an injected fake fetch (no network).
function fakeFetch(map: Record<string, unknown>) {
  return (url: string) => Promise.resolve({
    json: () => {
      if (!(url in map)) throw new Error(`unexpected url ${url}`);
      return Promise.resolve(map[url]);
    },
  });
}

Deno.test("resolveProductImageUrl: two-hop resolves the image", async () => {
  const url = await resolveProductImageUrl("lisinopril", {
    fetchImpl: fakeFetch({
      [dailyMedSplsUrl("lisinopril")]: { data: [{ setid: "set-9" }] },
      [dailyMedMediaUrl("set-9")]: { data: { media: [{ url: "https://dailymed.nlm.nih.gov/dailymed/image.cfm?n=pill.jpg" }] } },
    }),
  });
  assertEquals(url, "https://dailymed.nlm.nih.gov/dailymed/image.cfm?n=pill.jpg");
});

Deno.test("resolveProductImageUrl: no setid → null (no media hop)", async () => {
  const url = await resolveProductImageUrl("notadrugxyz", {
    fetchImpl: fakeFetch({ [dailyMedSplsUrl("notadrugxyz")]: { data: [] } }),
  });
  assertEquals(url, null);
});

Deno.test("resolveProductImageUrl: setid but no media → null", async () => {
  const url = await resolveProductImageUrl("lisinopril", {
    fetchImpl: fakeFetch({
      [dailyMedSplsUrl("lisinopril")]: { data: [{ setid: "set-9" }] },
      [dailyMedMediaUrl("set-9")]: { data: { media: [] } },
    }),
  });
  assertEquals(url, null);
});

Deno.test("resolveProductImageUrl: a thrown fetch is swallowed → null", async () => {
  const url = await resolveProductImageUrl("lisinopril", {
    fetchImpl: () => { throw new Error("network down"); },
  });
  assertEquals(url, null);
});

Deno.test("resolveProductImageUrl: blank name → null without fetching", async () => {
  const url = await resolveProductImageUrl("   ", {
    fetchImpl: () => { throw new Error("should not fetch"); },
  });
  assertEquals(url, null);
});
