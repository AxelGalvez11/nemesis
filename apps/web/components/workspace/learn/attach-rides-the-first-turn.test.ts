import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 🔴🔴🔴 THE FIRST ANSWER SAID "I DON'T SEE ANY DOCUMENT" OVER A DOCUMENT THAT INGESTED PERFECTLY.
//
// Owner, 2026-08-31: *"when I dropped in documents, I didn't parse them. I didn't even ingest them
// at all."* Both halves of that sentence were false, and that is the defect: the file uploaded,
// filed and parsed (their Wednesday drops sit complete in `library_sources`), but the front door's
// opening ask fired as its own process, raced the ingestion, and reached the model with an empty
// source list. The model then truthfully reported seeing nothing — which reads, from the learner's
// seat, exactly like the pipeline losing their material. Reproduced end to end on production
// 2026-08-31 (probe learner, storage 200, extract 200, parse complete, and the reply still opened
// with "I don't see any document attached yet").
//
// The mechanism that ends it has three legs, and each is pinned here because each fails silently
// on its own:
//   1. attachFiles/attachUrl REGISTER their in-flight work synchronously (a wrapper adds the
//      promise to `attaching` before anything awaits);
//   2. a turn going out (`converse`, `begin`) AWAITS `settledAttachments()` before it reads
//      `latest.current` to build its packet;
//   3. the front-door file latch runs ABOVE the opening-ask effect, so on the ready commit the
//      attach has STARTED before the ask fires — effects in one commit run in source order.

const SESSION = readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");

function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const sessionCode = code(SESSION);
const canvasCode = code(CANVAS);

// ── 1. Registration is synchronous ──────────────────────────────────────────

test("🔴🔴 attachFiles registers its promise in the same tick it is called", () => {
  // The wrapper shape is the mechanism: run first, add before anything can interleave. A version
  // that registered inside the async body — after its first await — would miss exactly the caller
  // this exists for (the opening ask fires in the same commit the attach starts in).
  const wrapper = sessionCode.match(
    /const run = attachFilesInner\(files, sourceUrl\);\s*attaching\.current\.add\(run\);/,
  );
  assert.ok(wrapper, "attachFiles must add its run to `attaching` synchronously, right after starting it");
});

test("🔴 attachUrl registers the same way — the scrape is the long half of a link", () => {
  const wrapper = sessionCode.match(/const run = attachUrlInner\(rawUrl\);\s*attaching\.current\.add\(run\);/);
  assert.ok(wrapper, "attachUrl must register in `attaching` synchronously, like attachFiles");
});

test("🔴 a settled attach leaves the set, or every later turn waits forever on nothing", () => {
  assert.match(sessionCode, /run\.finally\(\(\) => attaching\.current\.delete\(run\)\)/);
});

// ── 2. Turns wait for material in flight ────────────────────────────────────

test("🔴🔴 converse awaits settled attachments BEFORE building the packet", () => {
  // Sliced at converse itself: `begin` above it also waits, and a whole-file indexOf would let
  // that earlier occurrence satisfy this test with converse's own wait deleted.
  const converse = sessionCode.slice(sessionCode.indexOf("const converse = useCallback"));
  const wait = converse.indexOf("await settledAttachments()");
  const packet = converse.indexOf("askCanvasChat(");
  assert.ok(wait !== -1, "converse must await settledAttachments()");
  assert.ok(packet !== -1, "askCanvasChat should still be the packet door");
  assert.ok(
    wait < packet,
    "the wait must come before askCanvasChat reads latest.current — after it, the packet has already left without the sources",
  );
});

test("🔴 begin awaits settled attachments before canStart counts sources", () => {
  // An empty send with material staged means "learn this with me"; while that material is still
  // uploading the source count is zero and canStart would refuse the exact learner it exists for.
  const begin = sessionCode.slice(sessionCode.indexOf("const begin = useCallback"));
  const wait = begin.indexOf("await settledAttachments()");
  const gate = begin.indexOf("canStart(");
  assert.ok(wait !== -1 && gate !== -1 && wait < gate, "begin must settle attachments before canStart");
});

test("🔴 settling means SETTLED, not succeeded — one bad file must not kill the canvas", () => {
  // allSettled, never all: a failed upload has already reported itself through the error strip,
  // and a rejecting gate would turn that report into a turn that never sends again.
  assert.match(sessionCode, /while \(attaching\.current\.size > 0\) await Promise\.allSettled/);
  assert.doesNotMatch(sessionCode, /await Promise\.all\(\[\.\.\.attaching/);
});

// ── 3. The front door attaches before it asks ───────────────────────────────

test("🔴🔴 the file latch sits ABOVE the opening-ask effect, and the order is load-bearing", () => {
  // Effects in one commit run in source order. With the ask first, the attach has not started
  // when the opening turn goes out, so there is nothing registered for converse to wait on —
  // which is precisely the production failure this file exists to hold shut.
  const latch = canvasCode.indexOf("const claimedFiles = useRef(false)");
  const ask = canvasCode.indexOf("const askedOnce = useRef(false)");
  assert.ok(latch !== -1 && ask !== -1, "both latches must exist");
  assert.ok(latch < ask, "takePending's latch must run before the opening ask fires");
});

test("🔴 the latch still claims exactly once and still attaches through the session door", () => {
  assert.match(canvasCode, /const files = takePending\(\);\s*claimedFiles\.current = true;\s*if \(files\?\.length\) void session\.attachFiles\(files\);/);
});
