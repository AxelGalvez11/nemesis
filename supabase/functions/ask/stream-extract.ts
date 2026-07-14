// Incremental extractor for the answer's LEAD paragraph out of a STREAMING tool-call arguments
// string (the generator's compose_answer JSON). The generator fills a structured form, not prose,
// so "streaming the answer" means decoding the bottom_line.text JSON string field as its chunks
// arrive. Pure state machine — no I/O, fully unit-tested; correctness here is what lets the UI
// show words while the model is still writing.
//
// Contract: push() returns the newly decoded text of bottom_line.text (possibly ""), handling
// JSON string escapes that split across chunk boundaries (trailing "\" or a partial \uXXXX wait
// for the next chunk). Once the field's closing quote is seen, further input is ignored.

export class LeadFieldExtractor {
  private args = "";
  private valueStart = -1; // index just past the opening quote of bottom_line's text value
  private scanned = -1; // decode resume point
  private done = false;
  private decoded = "";

  push(chunk: string): string {
    this.args += chunk;
    if (this.done) return "";

    if (this.valueStart < 0) {
      const anchor = this.args.indexOf('"bottom_line"');
      if (anchor < 0) return "";
      // bottom_line may arrive as {text, citations} or (DeepSeek quirk) a bare string. Match the
      // first "text" key after the anchor, else a bare string value right after the colon.
      const objText = /"text"\s*:\s*"/g;
      objText.lastIndex = anchor;
      const m = objText.exec(this.args);
      if (m) {
        this.valueStart = m.index + m[0].length;
      } else {
        const bare = /"bottom_line"\s*:\s*"/g;
        bare.lastIndex = anchor;
        const b = bare.exec(this.args);
        if (!b) return "";
        this.valueStart = b.index + b[0].length;
      }
      this.scanned = this.valueStart;
    }

    let i = this.scanned;
    let out = "";
    while (i < this.args.length) {
      const ch = this.args[i];
      if (ch === '"') {
        this.done = true;
        break;
      }
      if (ch === "\\") {
        if (i + 1 >= this.args.length) break; // escape split across chunks — wait
        const esc = this.args[i + 1];
        if (esc === "u") {
          if (i + 6 > this.args.length) break; // partial \uXXXX — wait
          const code = parseInt(this.args.slice(i + 2, i + 6), 16);
          out += Number.isNaN(code) ? "" : String.fromCharCode(code);
          i += 6;
          continue;
        }
        const map: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        out += map[esc] ?? esc;
        i += 2;
        continue;
      }
      out += ch;
      i += 1;
    }
    this.scanned = i;
    this.decoded += out;
    return out;
  }

  /** Everything decoded so far. */
  get text(): string {
    return this.decoded;
  }
}
