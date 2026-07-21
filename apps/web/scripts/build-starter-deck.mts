// One-time converter: turns an Anki .apkg into a starter-deck payload JSON
// (for apps/web/public/starter-decks/) plus a media/ folder of renamed images
// ready to upload once to the public starter-deck-media storage bucket.
//
// Usage (from apps/web):
//   npx tsx scripts/build-starter-deck.mts \
//     --apkg "/path/to/Deck.apkg" --id captain-hook --out ../../.starter-deck-out \
//     --base https://<project>.supabase.co/storage/v1/object/public/starter-deck-media/captain-hook
//
// Media files are renamed to m<zipIndex>.<ext> so URLs never carry unicode or
// spaces. The payload's card text references those URLs as markdown images.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync } from "fflate";
import { decompress } from "fzstd";
import initSqlJs from "sql.js";

import { buildImageResolver, decompressMediaFile, isImageFileName, parseMediaManifest } from "../lib/workspace/anki-media";
import { parseAnkiPackage } from "../lib/workspace/anki-package";

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`Missing --${name}`);
  return process.argv[index + 1];
}

const apkgPath = arg("apkg");
const deckId = arg("id");
const outDir = arg("out");
const baseUrl = arg("base").replace(/\/$/, "");
// Optional: replace the deck tree's root segment (Anki authors often prefix
// roots with "." for sort order) with a product-facing name.
const rootIndex = process.argv.indexOf("--root-name");
const rootName = rootIndex >= 0 ? process.argv[rootIndex + 1] : null;

function renameRoot(name: string): string {
  if (!rootName) return name;
  const separator = name.indexOf("::");
  return separator < 0 ? rootName : `${rootName}${name.slice(separator)}`;
}

const bytes = new Uint8Array(readFileSync(apkgPath));
console.log(`Read ${(bytes.length / 1024 / 1024).toFixed(1)} MB from ${apkgPath}`);

const files = unzipSync(bytes);
const manifest = parseMediaManifest(files["media"], decompress);
console.log(`Media manifest: ${manifest.size} entries`);

// Write image media out under stable names and build filename -> URL map.
const mediaDir = join(outDir, "media");
mkdirSync(mediaDir, { recursive: true });
const urls = new Map<string, string>();
let written = 0;
let skippedNonImage = 0;
let missingBytes = 0;
let mediaBytes = 0;
for (const [zipName, fileName] of manifest) {
  if (!isImageFileName(fileName)) {
    skippedNonImage += 1;
    continue;
  }
  const data = files[zipName];
  if (!data) {
    missingBytes += 1;
    continue;
  }
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const newName = `m${zipName}${ext}`;
  // New-format packages zstd-compress each media file individually.
  const raw = decompressMediaFile(data, decompress);
  writeFileSync(join(mediaDir, newName), raw);
  urls.set(fileName, `${baseUrl}/${newName}`);
  written += 1;
  mediaBytes += raw.length;
}
console.log(`Media written: ${written} images (${(mediaBytes / 1024 / 1024).toFixed(1)} MB), skipped ${skippedNonImage} non-image, ${missingBytes} missing`);

let resolved = 0;
let unresolved = 0;
const misses = new Map<string, number>();
const resolver = buildImageResolver(urls);
const countingResolver = (src: string): string | null => {
  const url = resolver(src);
  if (url) resolved += 1;
  else {
    unresolved += 1;
    misses.set(src, (misses.get(src) ?? 0) + 1);
  }
  return url;
};

const SQL = await initSqlJs();
const result = parseAnkiPackage(bytes, SQL, { resolveImage: countingResolver });

console.log(`Decks: ${result.decks.length}, cards: ${result.cardCount}, skipped notes: ${result.skippedNotes}`);
console.log(`Images resolved into cards: ${resolved}, unresolved: ${unresolved}, still needs-image: ${result.needsImageCount}`);
if (misses.size > 0) {
  console.log("Top unresolved srcs:");
  for (const [src, count] of Array.from(misses.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${count}x ${src.slice(0, 100)}`);
  }
}

const payload = {
  id: deckId,
  decks: result.decks.map((deck) => ({
    name: renameRoot(deck.name),
    cards: deck.cards.map((card) => ({ back: card.back, cardType: card.cardType, front: card.front, tags: card.tags })),
  })),
};
const json = JSON.stringify(payload);
const payloadPath = join(outDir, `${deckId}.json`);
writeFileSync(payloadPath, json);
console.log(`Payload: ${payloadPath} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(`First deck: ${result.decks[0]?.name} · sample front: ${result.decks[0]?.cards[0]?.front.slice(0, 120)}`);
