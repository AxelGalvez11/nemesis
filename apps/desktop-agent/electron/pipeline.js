// The watch->act->deliver pipeline for a single file. Pure of Electron so test/core.mjs can drive it.
// Order: dedupe by content hash -> extract text -> generate study material -> write artifacts -> record.

const fs = require("fs");
const path = require("path");
const { extractText, classify } = require("./extract.js");
const { generateStudyMaterial } = require("./generate.js");
const { writeStudyMaterial } = require("./output.js");
const { hashContent } = require("./state.js");
const { inferCourse } = require("./courses.js");

/**
 * @param {string} filePath
 * @param {{ apiKey?: string, baseUrl?: string, model?: string, outDir: string }} config
 * @param {import('./state.js').Store} store
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<{ status: string, source: string, deck?: string, cardCount?: number, deckDir?: string, reason?: string }>}
 */
async function processFile(filePath, config, store, onProgress) {
  const source = path.basename(filePath);
  const log = (m) => { if (onProgress) onProgress(m); };

  const kind = classify(filePath);
  if (kind === "ignore") return { status: "ignored", source };

  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (e) {
    return record(store, { status: "error", source, reason: `could not open file: ${e.message}` });
  }
  const hash = hashContent(buf);
  if (store.isProcessed(hash)) return { status: "skipped", source };

  if (kind === "not_yet") {
    return record(store, { status: "needs_pdf", source, reason: "PowerPoint/Word not readable yet — export to PDF." });
  }

  log(`Reading ${source}…`);
  const extracted = await extractText(filePath);
  if (!extracted.ok) {
    return record(store, { status: "error", source, reason: extracted.reason });
  }

  if (!config.apiKey) {
    // Watched and noticed, but generation is off until a key is set. Do NOT mark processed — so it will
    // be picked up once a key is added.
    return record(store, { status: "detected", source, reason: "new file detected (add a DeepSeek key to auto-generate study material)" });
  }

  log(`Generating pharmacy-grade study material for ${source}…`);
  let material;
  try {
    material = await generateStudyMaterial({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      text: extracted.text,
      sourceName: source,
    });
  } catch (e) {
    return record(store, { status: "error", source, reason: e && e.message ? e.message : String(e) });
  }

  const course = inferCourse(filePath, config.watchFolder);
  const written = writeStudyMaterial({ outDir: config.outDir, sourceName: source, material });
  store.markProcessed(hash, { at: new Date().toISOString(), source, deck: material.deck_title });
  return record(store, {
    status: "generated",
    source,
    course,
    deck: material.deck_title,
    cardCount: written.cardCount,
    deckDir: written.deckDir,
  });
}

function record(store, entry) {
  store.addActivity(entry);
  return entry;
}

module.exports = { processFile };
