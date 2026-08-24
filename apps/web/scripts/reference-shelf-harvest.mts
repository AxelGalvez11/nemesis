// Harvests NAMED COLLECTIONS from Wikimedia Commons into `lib/learn/reference-shelf.ts` — the
// bulk half of §42's rung three, built on the owner's 2026-08-23 instruction to ingest at scale.
//
// 🔴 COLLECTIONS, NEVER A CRAWL. The standing rule — *"Do NOT bulk-ingest the internet"* — draws
// the line between harvesting a SOURCE somebody chose (the OpenStax textbook figures, the Blausen
// medical gallery, Gray's Anatomy plates) and trawling a topic. Every category below is a named
// provenance, listed here in code where adding one is a reviewed change.
//
// 🔴 THE LICENCE GATE RUNS PER FILE, EXACTLY AS IT DOES FOR ONE ROW. Each file's own
// `LicenseShortName` is read through the repository API and normalised through the SAME
// `normaliseLicence` the live provider uses. A file whose licence does not normalise emits no row —
// at any scale. The per-collection refusal counts are printed so the gate's work is visible.
//
//   pnpm tsx scripts/reference-shelf-harvest.mts          # harvest everything, write the shelf
//   pnpm tsx scripts/reference-shelf-harvest.mts --dry    # collect and count, write nothing

import { writeFileSync } from "node:fs";

import { normaliseLicence, plainText } from "../lib/learn/reference-images";
import type { CuratedEntry } from "../lib/learn/reference-images";

const UA = "NemesisLearn/1.0 (https://enternemesis.com; shelf harvest)";
const OUT = new URL("../lib/learn/reference-shelf.ts", import.meta.url);

interface Collection {
  readonly category: string;
  /** Follow subcategories this deep. Collections organise by chapter or by system; 2 covers them. */
  readonly depth: number;
  /** Subcategories to skip, by pattern — translation sets, conversion queues. */
  readonly skipSubcats?: RegExp;
}

/** The named sources. Adding one is a code review, which is the point. */
const COLLECTIONS: readonly Collection[] = [
  // The OpenStax figure corpus that legally escaped under CC BY before the licence change —
  // biology, anatomy & physiology, microbiology, and the non-life-science books that keep the
  // shelf field-agnostic.
  { category: "CNX Anatomy & Physiology Textbook", depth: 2 },
  { category: "CNX Biology Textbook", depth: 2 },
  { category: "CNX Microbiology Textbook", depth: 2 },
  { category: "CNX Chemistry Textbook", depth: 2 },
  { category: "CNX Astronomy Textbook", depth: 2 },
  { category: "CNX University Physics Textbook", depth: 2 },
  { category: "Graphics by OpenStax", depth: 1 },
  // The Blausen Medical gallery (CC BY 3.0) — English and language-neutral sets only; the
  // translated label sets are the same art and would be inert rows for an English-first product.
  {
    category: "Images from Blausen Medical Communications",
    depth: 2,
    skipSubcats: /with labels in (?!English)/i,
  },
  // The classic Gray's Anatomy plates (1918, public domain) — the anatomy atlas itself.
  { category: "Gray's Anatomy plates", depth: 2 },
  // Servier Medical Art (CC BY) — thousands of clean medical and cell-biology vectors.
  { category: "Media from SMART-Servier Medical Art", depth: 1 },
  // The CDC's Public Health Image Library uploads — micrographs and public-health photography.
  { category: "Images from the CDC Public Health Image Library", depth: 2 },
  // NHGRI's genome.gov illustrations — genetics concept art, public domain.
  { category: "Genome.gov images", depth: 1 },
];

/** Files whose labels are clearly a translation; inert for matching and skipped for weight. */
const TRANSLATED = /(\((?:ar|bn|ca|cs|da|de|el|es|fa|fi|fr|gu|he|hi|hr|hu|id|it|ja|kn|ko|ku|lt|lv|ml|mr|ms|ne|nl|no|pl|pt|ro|ru|sk|sl|sr|sv|ta|te|th|tr|uk|ur|vi|zh)(?:-[a-z]+)?\)|[-_ ](?:ar|bn|fa|gu|hi|kn|ku|ml|mr|ta|te|tr|uk|ur|sr|sl)\.(?:svg|png|jpe?g|gif)$|\b(?:Persian|Castellano|Catala|Türkçe|русский)\b)/i;

/** Meta subcategories that are queues, not collections. */
const META_SUBCAT = /should be converted|missing|without categories|unidentified|to be checked/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(params: Record<string, string>): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(`https://commons.wikimedia.org/w/api.php?${query}`, {
        headers: { accept: "application/json", "user-agent": UA },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Commons answered ${response.status}`);
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (attempt >= 3) throw error;
      await sleep(1500 * (attempt + 1));
    }
  }
}

/** Every file title in a category tree, bounded by depth, translations and meta-queues skipped. */
async function fileTitles(root: string, depth: number, skipSubcats?: RegExp): Promise<string[]> {
  const titles = new Set<string>();
  const queue: Array<{ category: string; depth: number }> = [{ category: root, depth }];
  const seenCats = new Set<string>();
  while (queue.length > 0) {
    const { category, depth: left } = queue.shift()!;
    if (seenCats.has(category)) continue;
    seenCats.add(category);
    let cmcontinue: string | undefined;
    do {
      const page = await api({
        action: "query",
        cmlimit: "500",
        cmtitle: `Category:${category}`,
        cmtype: "file|subcat",
        list: "categorymembers",
        ...(cmcontinue ? { cmcontinue } : {}),
      });
      const query = page.query as { categorymembers?: Array<{ title: string; ns: number }> } | undefined;
      for (const member of query?.categorymembers ?? []) {
        if (member.ns === 6) {
          if (!TRANSLATED.test(member.title)) titles.add(member.title);
        } else if (member.ns === 14 && left > 1) {
          const name = member.title.replace(/^Category:/, "");
          if (META_SUBCAT.test(name)) continue;
          if (skipSubcats?.test(name)) continue;
          queue.push({ category: name, depth: left - 1 });
        }
      }
      cmcontinue = (page.continue as { cmcontinue?: string } | undefined)?.cmcontinue;
      await sleep(80);
    } while (cmcontinue);
  }
  return [...titles];
}

interface Stats {
  candidates: number;
  passed: number;
  refusedLicence: number;
  notAnImage: number;
  unmatchable: number;
}

/** The stem of a file title: what the file is called, minus the noise. */
function titleStem(title: string): string {
  return title
    .replace(/^File:/, "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[_]+/g, " ")
    // Leading figure numbering: "1401 ", "Figure 10 02 01", "OSC Microbio 03 02 ", "CNX Chem…"
    .replace(/^(?:OSC[\s_]+\w+[\s_]+|CNX[\s_]+\w+[\s_]+|Figure)[\s_]*[\d\s_.-]*/i, "")
    .replace(/^[\d\s_.-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Harvest one collection into rows. */
async function harvest(collection: Collection, rows: Map<string, CuratedEntry>): Promise<Stats> {
  const stats: Stats = { candidates: 0, notAnImage: 0, passed: 0, refusedLicence: 0, unmatchable: 0 };
  const titles = await fileTitles(collection.category, collection.depth, collection.skipSubcats);
  stats.candidates = titles.length;

  for (let start = 0; start < titles.length; start += 50) {
    const batch = titles.slice(start, start + 50);
    const page = await api({
      action: "query",
      iiprop: "url|extmetadata|mime",
      iiurlwidth: "1024",
      prop: "imageinfo",
      titles: batch.join("|"),
    });
    const pages = (page.query as { pages?: Array<Record<string, unknown>> } | undefined)?.pages ?? [];
    for (const file of pages) {
      const title = typeof file.title === "string" ? file.title : "";
      const info = Array.isArray(file.imageinfo) ? (file.imageinfo[0] as Record<string, unknown>) : null;
      if (!info) continue;
      const mime = typeof info.mime === "string" ? info.mime : "";
      if (!mime.startsWith("image/")) {
        stats.notAnImage += 1;
        continue;
      }
      const meta = (info.extmetadata ?? {}) as Record<string, { value?: unknown }>;
      const licence = normaliseLicence(plainText(meta.LicenseShortName?.value));
      if (!licence) {
        stats.refusedLicence += 1;
        continue;
      }
      const thumbRaw = typeof info.thumburl === "string" ? info.thumburl : typeof info.url === "string" ? info.url : "";
      const thumb = thumbRaw.split("?")[0] ?? "";
      const pageUrl = typeof info.descriptionurl === "string" ? info.descriptionurl : "";
      if (!thumb.startsWith("https://upload.wikimedia.org/") || !pageUrl) {
        stats.notAnImage += 1;
        continue;
      }
      const stem = titleStem(title);
      const description = plainText(meta.ImageDescription?.value)?.replace(/\s+/g, " ").trim() ?? "";
      // A row nobody could ever match is dead weight: no readable name and no description.
      if (stem.length < 4 && description.length < 12) {
        stats.unmatchable += 1;
        continue;
      }
      const author = plainText(meta.Artist?.value)?.slice(0, 160);
      const caption = (description || stem).slice(0, 280);
      const concepts = [stem, description.slice(0, 140)].filter((part) => part.length >= 4);
      const entry: CuratedEntry = {
        assetPath: thumb,
        attribution: (author ?? stem).slice(0, 180),
        ...(author ? { author } : {}),
        caption,
        concepts,
        licence,
        source: "Wikimedia Commons",
        url: pageUrl,
      };
      if (!rows.has(entry.assetPath)) {
        rows.set(entry.assetPath, entry);
        stats.passed += 1;
      }
    }
    await sleep(120);
  }
  return stats;
}

const dry = process.argv.includes("--dry");
const rows = new Map<string, CuratedEntry>();
const report: string[] = [];
for (const collection of COLLECTIONS) {
  const stats = await harvest(collection, rows);
  const line = `${collection.category}: ${stats.passed} rows of ${stats.candidates} files (${stats.refusedLicence} refused by licence, ${stats.notAnImage} not images, ${stats.unmatchable} unmatchable)`;
  report.push(line);
  console.log(line);
}
console.log(`\nTOTAL: ${rows.size} rows`);

if (!dry) {
  const sorted = [...rows.values()].sort((a, b) => a.assetPath.localeCompare(b.assetPath));
  const body = `// GENERATED by scripts/reference-shelf-harvest.mts — do not edit rows by hand.
//
// The bulk half of §42's rung three: named collections harvested from Wikimedia Commons on
// ${new Date().toISOString().slice(0, 10)}, every file's own licence read through the repository API and normalised
// through the same \`normaliseLicence\` the live provider uses. A file whose licence did not
// normalise emitted no row. Re-run the script to refresh; hand-picked rows live in
// \`reference-registry.ts\` and are listed ahead of these.
//
// Collections and the gate's work:
${report.map((line) => `//   ${line}`).join("\n")}

import type { CuratedEntry } from "./reference-images";

export const REFERENCE_SHELF: readonly CuratedEntry[] = ${JSON.stringify(sorted, null, 1)};
`;
  writeFileSync(OUT, body);
  console.log(`wrote ${OUT.pathname}`);
}
