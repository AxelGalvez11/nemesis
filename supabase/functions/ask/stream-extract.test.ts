// Tests for LeadFieldExtractor (stream-extract.ts) and SafeTextEmitter (stream-gate.ts) — the two
// pure pieces streaming correctness and the streamed doc-20 guarantee rest on.
// Run: deno test --allow-env supabase/functions/ask/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { LeadFieldExtractor } from "./stream-extract.ts";
import { SafeTextEmitter } from "./stream-gate.ts";

function feed(ex: LeadFieldExtractor, s: string, chunkSize: number): string {
  let out = "";
  for (let i = 0; i < s.length; i += chunkSize) out += ex.push(s.slice(i, i + chunkSize));
  return out;
}

const ARGS = '{"bottom_line":{"text":"Yes — metformin lowers HbA1c.","citations":["[1]"]},"what_we_know":[{"text":"ignored","citations":[]}]}';

Deno.test("extracts bottom_line.text whole", () => {
  const ex = new LeadFieldExtractor();
  assertEquals(ex.push(ARGS), "Yes — metformin lowers HbA1c.");
});

Deno.test("extracts identically across every chunking", () => {
  for (const size of [1, 2, 3, 5, 7, 11, 64]) {
    const ex = new LeadFieldExtractor();
    assertEquals(feed(ex, ARGS, size), "Yes — metformin lowers HbA1c.", `chunk size ${size}`);
  }
});

Deno.test("stops at the closing quote — later fields never leak", () => {
  const ex = new LeadFieldExtractor();
  ex.push(ARGS);
  assertEquals(ex.push('{"more":"stuff"}'), "");
  assertEquals(ex.text, "Yes — metformin lowers HbA1c.");
});

Deno.test("decodes escapes split across chunk boundaries", () => {
  const args = '{"bottom_line":{"text":"a\\"b\\nc\\u00e9d"}}';
  for (const size of [1, 2, 3, 4]) {
    const ex = new LeadFieldExtractor();
    assertEquals(feed(ex, args, size), 'a"b\ncéd', `chunk size ${size}`);
  }
});

Deno.test("handles DeepSeek's bare-string bottom_line quirk", () => {
  const ex = new LeadFieldExtractor();
  assertEquals(ex.push('{"bottom_line":"Bare lead.","evidence_grade":"weak"}'), "Bare lead.");
});

Deno.test("emits nothing before bottom_line appears", () => {
  const ex = new LeadFieldExtractor();
  assertEquals(ex.push('{"evidence_grade":"weak",'), "");
  assertEquals(ex.push('"bottom_line":{"text":"Lead."}}'), "Lead.");
});

// ---- SafeTextEmitter ----

Deno.test("gate: holds back the tail and emits scanned prefixes", () => {
  const gate = new SafeTextEmitter(() => true, 5);
  assertEquals(gate.push("hello world"), "hello ");
  assertEquals(gate.push("again"), "world");
  assertEquals(gate.finalize(), "again");
  assert(gate.emittedAny);
});

Deno.test("gate: never emits a prefix containing a violation, and freezes", () => {
  const clean = (t: string) => !t.includes("FORBIDDEN");
  const gate = new SafeTextEmitter(clean, 4);
  const a = gate.push("this is fine so far ");
  assert(a === null || !a.includes("FORBIDDEN"));
  const b = gate.push("FORBIDDEN phrase completed here");
  assertEquals(b, null);
  assert(gate.isFrozen);
  assertEquals(gate.push(" more"), null);
  assertEquals(gate.finalize(), null);
});

Deno.test("gate: every emitted prefix passed the scan (exhaustive over chunkings)", () => {
  const clean = (t: string) => !t.includes("do not show");
  const text = "safe text then do not show and after";
  for (const size of [1, 2, 3, 5, 8]) {
    const gate = new SafeTextEmitter(clean, 6);
    let shown = "";
    for (let i = 0; i < text.length; i += size) {
      const out = gate.push(text.slice(i, i + size));
      if (out) shown += out;
      assert(clean(shown), `dirty prefix displayed at chunk ${size}: ${JSON.stringify(shown)}`);
    }
    const tail = gate.finalize();
    if (tail) shown += tail;
    assert(clean(shown));
  }
});

Deno.test("gate: finalize scans the full text before releasing the tail", () => {
  // The violation completes INSIDE the held-back tail: pushes emitted only the clean prefix, and
  // finalize must scan the full text, freeze, and release nothing.
  const clean = (t: string) => !t.includes("bad-end");
  const gate = new SafeTextEmitter(clean, 10);
  const shown = gate.push("something bad-end");
  assert(shown === null || clean(shown));
  assertEquals(gate.finalize(), null);
  assert(gate.isFrozen);
});

Deno.test("gate: finalize releases the tail when the full text is clean", () => {
  const gate = new SafeTextEmitter(() => true, 10);
  assertEquals(gate.push("tiny"), null); // under holdback — nothing visible yet
  assertEquals(gate.finalize(), "tiny");
});
