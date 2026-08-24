import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { MEMORY_KINDS, MEMORY_PACKET_LIMIT, memoryBlock, type MemoryLine } from "./learner-memory";

// ── what Nemesis remembers about a person (workstream C) ────────────────────────────────────
//
// 🔴🔴 THE FEATURE IS PERMISSIBLE BECAUSE THE SUBJECT CAN READ IT AND DELETE IT. Memory a learner
// can see and remove is a feature; memory they cannot is surveillance. Every guard here defends
// one of the two halves of that: plain sentences going in, and a real way out.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const STORE = strip(readFileSync(new URL("./learner-memory.ts", import.meta.url), "utf8"));
const SETTINGS = strip(readFileSync(new URL("../../components/settings/memory-settings.tsx", import.meta.url), "utf8"));
const SESSION = strip(readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8"));
const CHAT = strip(readFileSync(new URL("../../components/workspace/learn/canvas-chat.ts", import.meta.url), "utf8"));

function line(over: Partial<MemoryLine> & { id: string }): MemoryLine {
  return {
    createdAt: "2026-08-24T00:00:00.000Z",
    expiresAt: null,
    kind: "subject",
    sourceCanvasId: null,
    statement: "Studying contract law.",
    ...over,
  };
}

// ── what reaches the model ──────────────────────────────────────────────────

test("nothing remembered means nothing in the packet, not an empty heading", () => {
  // A packet that announces a memory section and lists nothing invites the model to fill it —
  // the same failure the `visuals: []` comment in turn-router.ts records.
  assert.equal(memoryBlock([]), "");
});

test("the block groups by kind and prints the learner's own sentences", () => {
  const block = memoryBlock([
    line({ id: "1", kind: "subject", statement: "Studying contract law." }),
    line({ id: "2", kind: "deadline", statement: "Final on the 14th." }),
  ]);
  assert.match(block, /What you study:\n- Studying contract law\./);
  assert.match(block, /Dates:\n- Final on the 14th\./);
});

test("🔴 the block is labelled as FACTS, never as instructions", () => {
  // The same line every context block in the packet is held to. A remembered sentence that reads
  // as an order ("teach them slowly") would be the mode selector §38 bans wearing memory's clothes.
  assert.match(memoryBlock([line({ id: "1" })]), /facts, not instructions/i);
});

test("🔴 only a bounded number ever ride on a turn", () => {
  // Memory may grow all term; what must stay bounded is the per-message cost, which is paid
  // forever. The cap is on the PACKET, not on what is kept — see loadMemory's own limit.
  const many = Array.from({ length: MEMORY_PACKET_LIMIT + 10 }, (_, i) =>
    line({ id: `m${i}`, statement: `Fact number ${i}.` }),
  );
  const block = memoryBlock(many);
  assert.equal((block.match(/^- /gm) ?? []).length, MEMORY_PACKET_LIMIT);
  assert.ok(!block.includes(`Fact number ${MEMORY_PACKET_LIMIT + 5}.`), "an over-cap line reached the model");
});

// ── what the learner can do about it ────────────────────────────────────────

test("🔴🔴 there is a way to read every line and a way to delete each one", () => {
  assert.ok(existsSync(new URL("../../components/settings/memory-settings.tsx", import.meta.url)), "the memory screen is gone");
  assert.match(SETTINGS, /line\.statement\}/, "the screen stopped printing the stored sentence itself");
  assert.match(SETTINGS, /forgetLine\(/, "a single line can no longer be deleted");
  assert.match(SETTINGS, /forgetEverything\(/, "there is no way to wipe it all");
  assert.match(SETTINGS, /aria-label=\{`Forget: \$\{line\.statement\}`\}/, "the delete control has no accessible name");
});

test("🔴 the screen prints the sentence verbatim rather than summarising it", () => {
  // If a learner cannot recognise a line as something they said, the bug is in what was STORED.
  // Nicer wording here would hide that bug for exactly as long as it mattered.
  assert.ok(!/summar|slice\(0, ?\d+\)|substring/i.test(SETTINGS), "the memory screen started shortening what it shows");
});

test("🔴🔴 wiping everything asks first", () => {
  assert.match(SETTINGS, /confirmingClear/, "the irreversible control lost its confirm step");
});

// ── what may never be stored ────────────────────────────────────────────────

test("🔴🔴 it stores readable sentences, never scores or embeddings", () => {
  // The schema decision that makes the screen above honest. An embedding column would make
  // "show me everything you remember" unanswerable rather than merely awkward.
  assert.ok(!/embedding|vector|score|confidence/i.test(STORE), "the memory store grew a field the learner cannot read");
  assert.deepEqual([...MEMORY_KINDS], ["subject", "deadline", "preference", "context"], "the closed set of kinds changed");
});

test("🔴🔴 it never mirrors the evidence log", () => {
  // What the learner got wrong lives in learner_evidence, judged and already feeding objective
  // ordering. A second, worse copy here would be consulted by something eventually.
  assert.ok(!/learner_evidence|objectiveIdentityKey|verdict/.test(STORE), "the memory store started duplicating the evidence log");
});

test("🔴 every read and write survives the table not existing yet", () => {
  // The migration is applied by the OWNER, never automatically. Until then the product must
  // behave exactly as it did before memory existed — a canvas that fails to open because a
  // remembering feature is not switched on is the use-policy-runtime defect all over again.
  const guarded = STORE.match(/} catch \{/g) ?? [];
  assert.ok(guarded.length >= 4, "a memory call can now throw into the caller");
  assert.match(SESSION, /void Promise\.all\(/, "the memory write is awaited, so a failed write can cost the learner their answer");
});

test("🔴 memory is loaded once per turn, not once per search round", () => {
  const body = CHAT.slice(CHAT.indexOf("const materialContext"), CHAT.indexOf("const ask ="));
  assert.match(body, /memoryBlock\(await loadMemory\(uid\)\)/, "memory moved inside the per-round call");
});

test("🔴 the migration ships with the code that needs it", () => {
  const migration = new URL("../../../../supabase/migrations/20260824T10_learner_memory.sql", import.meta.url);
  assert.ok(existsSync(migration), "the learner_memory migration is missing — the feature cannot store anything");
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /enable row level security/, "the table ships without RLS");
  assert.match(sql, /auth\.uid\(\) = user_id/, "one learner could read another's memory");
  // Client-writable on purpose: deleting must work from the learner's own browser.
  assert.ok(!/revoke all on public\.learner_memory/.test(sql), "the learner cannot delete their own memory from the browser");
});
