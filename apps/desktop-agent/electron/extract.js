// Extract plain text from a lecture file. v0 supports PDF (the common slide export) plus .txt/.md.
// PowerPoint/Word are a fast follow (officeparser/mammoth) — flagged, not silently dropped.

const fs = require("fs");
const path = require("path");

const SUPPORTED = new Set([".pdf", ".txt", ".md", ".markdown"]);
// Extensions we recognize as lecture material but can't read yet — surfaced to the user, not ignored.
const NOT_YET = new Set([".pptx", ".ppt", ".docx", ".doc"]);

function classify(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (SUPPORTED.has(ext)) return "supported";
  if (NOT_YET.has(ext)) return "not_yet";
  return "ignore";
}

/**
 * @param {string} filePath
 * @returns {Promise<{ ok: boolean, text?: string, reason?: string }>}
 */
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === ".pdf") {
      // Lazy-require so app startup doesn't pull pdf-parse, and to sidestep its load-time debug path.
      const pdfParse = require("pdf-parse");
      const buf = fs.readFileSync(filePath);
      const data = await pdfParse(buf);
      return { ok: true, text: data.text || "" };
    }
    if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
      return { ok: true, text: fs.readFileSync(filePath, "utf8") };
    }
    if (NOT_YET.has(ext)) {
      return { ok: false, reason: `${ext} files aren't readable yet (PowerPoint/Word support is coming) — export to PDF for now.` };
    }
    return { ok: false, reason: `unsupported file type ${ext}` };
  } catch (e) {
    return { ok: false, reason: `could not read file: ${e && e.message ? e.message : String(e)}` };
  }
}

module.exports = { extractText, classify, SUPPORTED, NOT_YET };
