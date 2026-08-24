// Curation tooling for `lib/learn/reference-registry.ts` — the by-hand half of §42's rung three.
//
// The registry's own header sets the bar: every row is "a file somebody opened, read the licence
// of, and wrote down". This script is how that is done without hand-transcribing wiki templates:
//
//   pnpm tsx scripts/reference-registry-harvest.mts search "mitosis diagram"
//     → the top Commons FILES for a concept, with their per-file licence, author and size,
//       so a human can pick one by reading what the repository records about it.
//
//   pnpm tsx scripts/reference-registry-harvest.mts verify "File:Mitosis Stages.svg" ...
//     → for each chosen file, re-reads the file's own metadata and prints a `CuratedEntry`
//       row — licence normalised through the SAME `normaliseLicence` the live provider uses,
//       attribution taken from the file's Artist field verbatim, asset URL as a bounded
//       rendition. A file whose licence does not normalise prints a refusal, never a row.
//
// The output is pasted into `REFERENCE_REGISTRY` by a person, which is the point: the registry
// stays something somebody chose, and this script only makes the reading part honest and fast.

import { normaliseLicence, plainText } from "../lib/learn/reference-images";

const UA = "NemesisLearn/1.0 (https://enternemesis.com; registry curation)";

interface FileFacts {
  title: string;
  licence: string | null;
  rawLicence?: string;
  author?: string;
  description?: string;
  thumb?: string;
  page?: string;
  size?: string;
  mime?: string;
}

async function api(params: Record<string, string>): Promise<unknown> {
  const query = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${query}`, {
    headers: { accept: "application/json", "user-agent": UA },
  });
  if (!response.ok) throw new Error(`Commons answered ${response.status}`);
  return response.json();
}

function factsOf(page: Record<string, unknown>): FileFacts {
  const info = Array.isArray(page.imageinfo) ? (page.imageinfo[0] as Record<string, unknown>) : {};
  const meta = (info?.extmetadata ?? {}) as Record<string, { value?: unknown }>;
  const raw = plainText(meta.LicenseShortName?.value);
  return {
    author: plainText(meta.Artist?.value),
    description: plainText(meta.ImageDescription?.value)?.slice(0, 160),
    licence: normaliseLicence(raw),
    mime: typeof info?.mime === "string" ? info.mime : undefined,
    page: typeof info?.descriptionurl === "string" ? info.descriptionurl : undefined,
    rawLicence: raw,
    size: typeof info?.width === "number" ? `${info.width}×${info.height}` : undefined,
    // The API appends analytics parameters to rendition URLs; the file serves without them, and a
    // registry row should carry the plain address.
    thumb: typeof info?.thumburl === "string" ? info.thumburl.split("?")[0] : undefined,
    title: typeof page.title === "string" ? page.title : "",
  };
}

async function search(concept: string): Promise<void> {
  const payload = (await api({
    action: "query",
    generator: "search",
    gsrlimit: "6",
    gsrnamespace: "6",
    gsrsearch: concept,
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: "1024",
    prop: "imageinfo",
  })) as { query?: { pages?: Array<Record<string, unknown>> } };
  const pages = payload.query?.pages ?? [];
  console.log(`\n== ${concept}`);
  for (const page of pages) {
    const facts = factsOf(page);
    const verdict = facts.licence ?? `REFUSED (${facts.rawLicence ?? "no licence read"})`;
    console.log(`  ${facts.title}\n    licence: ${verdict} | ${facts.size ?? "?"} ${facts.mime ?? ""} | by ${facts.author ?? "?"}\n    ${facts.description ?? ""}`);
  }
}

async function verify(titles: string[]): Promise<void> {
  const payload = (await api({
    action: "query",
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: "1024",
    prop: "imageinfo",
    titles: titles.join("|"),
  })) as { query?: { pages?: Array<Record<string, unknown>> } };
  const pages = payload.query?.pages ?? [];
  for (const page of pages) {
    const facts = factsOf(page);
    if (!facts.licence) {
      console.log(`// ✗ ${facts.title}: licence "${facts.rawLicence ?? "none"}" does not normalise — NO ROW`);
      continue;
    }
    if (!facts.thumb || !facts.page) {
      console.log(`// ✗ ${facts.title}: no rendition or page URL came back — NO ROW`);
      continue;
    }
    const attribution = facts.author ?? facts.title.replace(/^File:/, "");
    console.log(`  {
    assetPath: ${JSON.stringify(facts.thumb)},
    attribution: ${JSON.stringify(attribution)},
    ${facts.author ? `author: ${JSON.stringify(facts.author)},\n    ` : ""}caption: ${JSON.stringify("FILL IN")},
    concepts: ["FILL", "IN"],
    licence: ${JSON.stringify(facts.licence)},
    source: "Wikimedia Commons",
    url: ${JSON.stringify(facts.page)},
  },`);
  }
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "search" && rest.length > 0) {
  for (const concept of rest) await search(concept);
} else if (mode === "verify" && rest.length > 0) {
  await verify(rest);
} else {
  console.log('usage:\n  tsx scripts/reference-registry-harvest.mts search "<concept>" ["<concept>" ...]\n  tsx scripts/reference-registry-harvest.mts verify "File:..." ["File:..." ...]');
  process.exit(1);
}
