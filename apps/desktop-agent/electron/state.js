// The anti-runaway core (per the autonomy research): a local state store keyed by content hash. The
// agent only acts on files it hasn't already processed, so re-scans, restarts, and duplicate file events
// are all no-ops instead of repeated work / repeated LLM spend. Plain JSON — no native DB dependency.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function hashContent(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

class Store {
  /** @param {string} dir directory to keep state in (e.g. Electron userData) */
  constructor(dir) {
    this.file = path.join(dir, "state.json");
    this.data = { processed: {}, activity: [], seen: {} };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) {
        this.data = JSON.parse(fs.readFileSync(this.file, "utf8"));
        if (!this.data.processed) this.data.processed = {};
        if (!Array.isArray(this.data.activity)) this.data.activity = [];
        if (!this.data.seen) this.data.seen = {};
      }
    } catch (_) {
      // corrupt state file → start clean rather than crash
      this.data = { processed: {}, activity: [] };
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (_) {
      // best-effort; losing state means at worst we reprocess a file, never a crash
    }
  }

  /** Has this exact content already been processed? (idempotency by hash, not filename.) */
  isProcessed(hash) {
    return Boolean(this.data.processed[hash]);
  }

  markProcessed(hash, record) {
    this.data.processed[hash] = { at: record.at, source: record.source, deck: record.deck || null };
    this._save();
  }

  /** Append an activity entry for the daily brief and return it. */
  addActivity(entry) {
    const item = Object.assign({ at: new Date().toISOString() }, entry);
    this.data.activity.unshift(item);
    // keep the log bounded
    if (this.data.activity.length > 500) this.data.activity.length = 500;
    this._save();
    return item;
  }

  recentActivity(limit) {
    return this.data.activity.slice(0, limit || 50);
  }

  /** Portal-item dedupe (by a stable id like a Canvas file id or a file URL) so scheduled scans only
   *  pull genuinely new material — the download-side twin of the content-hash check. */
  isSeen(key) { return Boolean(this.data.seen[key]); }
  markSeen(key, meta) { this.data.seen[key] = Object.assign({ at: new Date().toISOString() }, meta || {}); this._save(); }
}

module.exports = { Store, hashContent };
