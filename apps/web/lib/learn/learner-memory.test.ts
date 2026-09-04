import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { MEMORY_KINDS, MEMORY_PACKET_LIMIT, memoryBlock, saysTheSameThing, type MemoryLine } from "./learner-memory";

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
  assert.match(SESSION, /void \(async \(\) => \{\n\s+let saved = 0;/, "the memory write is awaited, so a failed write can cost the learner their answer");
});

test("🔴 memory is loaded once per turn, not once per search round", () => {
  // 2026-08-31: the read rides the turn's one Promise.all gather now (four independent context
  // reads that used to queue behind each other). Still exactly once, still before `ask` exists.
  // 🔴 ANCHORED ON THE GATHER, NOT ON WHATEVER HAPPENS TO SIT ABOVE IT. This sliced from
  // `const materialContext`, which was the first line of the function until retrieval moved it
  // below the gather it now depends on — the guard failed on a reordering, not on memory.
  const body = CHAT.slice(CHAT.indexOf("await Promise.all(["), CHAT.indexOf("const ask ="));
  assert.match(body, /loadMemory\(uid\)/, "memory left the per-turn gather");
  assert.match(body, /memoryBlock\(memoryRows\)/, "the gathered rows never become the packet block");
  assert.ok(!/loadMemory/.test(CHAT.slice(CHAT.indexOf("const ask ="))), "memory moved inside the per-round call");
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

// ── near-duplicates, found in the first two rows this feature ever wrote ─────────────────────

test("🔴🔴 the real production pair is caught", () => {
  // Verbatim from learner_memory on 2026-08-24, filed under two different kinds. One fact, twice.
  assert.equal(
    saysTheSameThing(
      "Learning the anatomy of the uterus for the first time.",
      "Learning the parts of the uterus for the first time.",
    ),
    true,
    "the pair that prompted this fix would still be stored twice",
  );
});

test("🔴🔴🔴 two deadlines that differ only by their date are NOT duplicates", () => {
  // The dangerous direction. These share every word except the figure, so word overlap alone
  // judges them the same and the second deadline is silently dropped. Losing a real deadline is
  // far worse than showing an extra line.
  assert.equal(saysTheSameThing("Exam on the 14th.", "Exam on the 21st."), false, "a second deadline would be swallowed");
  assert.equal(saysTheSameThing("Essay due in 3 weeks.", "Essay due in 8 weeks."), false);
  assert.equal(saysTheSameThing("Chapter 4 test.", "Chapter 7 test."), false);
});

test("🔴🔴 two topics inside one subject stay separate", () => {
  // The over-merging direction, and the reason the threshold is not higher still. Someone studying
  // several structures must get a line for each; collapsing them would lose what they are studying.
  assert.equal(
    saysTheSameThing("Learning the anatomy of the uterus.", "Learning the anatomy of the heart."),
    false,
    "two different topics were merged into one memory",
  );
  assert.equal(saysTheSameThing("Studying contract law.", "Studying tort law."), false);
  assert.equal(saysTheSameThing("Prefers worked examples.", "Prefers short examples."), false);
});

test("genuinely different facts survive", () => {
  assert.equal(saysTheSameThing("Studying contract law.", "Studying mechanical engineering."), false);
  assert.equal(saysTheSameThing("Prefers worked examples.", "Final on the 14th."), false);
  // Field-agnostic: the same shape of pair in another discipline behaves identically.
  assert.equal(
    saysTheSameThing("Learning the anatomy of the crankshaft for the first time.", "Learning the parts of the crankshaft for the first time."),
    true,
  );
});

test("wording and punctuation do not make a new fact", () => {
  assert.equal(saysTheSameThing("Studying contract law", "studying CONTRACT LAW."), true);
  assert.equal(saysTheSameThing("I am studying contract law.", "Studying contract law."), true);
});

test("an empty statement is never a duplicate of anything", () => {
  assert.equal(saysTheSameThing("", "Studying contract law."), false);
  assert.equal(saysTheSameThing("   ", ""), false);
});

test("🔴 the duplicate check runs across every kind, not within one", () => {
  // The production pair was filed under `subject` and `context`; a check scoped to one kind cannot
  // see it at all. The kinds are a filing convenience for the Settings screen, never a reason to
  // hold the same fact twice.
  const source = STORE.slice(STORE.indexOf("export async function rememberLine"));
  assert.match(source, /existing\.some\(\(line\) => saysTheSameThing\(line\.statement, statement\)\)/);
  assert.ok(!/line\.kind === input\.kind/.test(source), "the duplicate check is scoped to one kind again");
});

// ── seeing that it happened, the way ChatGPT does ───────────────────────────────────────────
//
// Owner 2026-08-24: *"does memory work like it does in ChatGPT where you basically can see the
// memory prompt and the updates?"* The Settings screen answered the first half. These hold the
// second: knowing AT THE MOMENT it happens, rather than discovering later that a file has been
// quietly accumulating.

test("🔴🔴 the notice fires only when something was actually written", () => {
  // `rememberLine` returns false for a near-duplicate. Saying "memory updated" for a fact already
  // held would train the learner to ignore the notice, which is the one thing a transparency
  // signal cannot afford.
  assert.match(SESSION, /if \(await rememberLine\(uid, \{ kind: fact\.kind, sourceCanvasId: id, statement: fact\.statement \}\)\) saved \+= 1;/, "the notice stopped counting real writes");
  assert.match(SESSION, /if \(saved > 0\) setMemoryNotice\(saved\);/, "the notice fires regardless of whether anything was kept");
});

test("🔴🔴 a turn's facts are written one after another, never in parallel", () => {
  // `rememberLine` refuses a near-duplicate by reading what is already held. Launched together,
  // three writes all read the table BEFORE any of them lands, so a turn that phrased one fact twice
  // stored it twice. Found in the owner's own memory, 2026-09-04: "Learning the anatomy of the
  // uterus for the first time" and "Learning the parts of the uterus for the first time", the same
  // turn, one under each kind — the exact pair `saysTheSameThing` scores at 0.67 and exists to catch.
  assert.match(SESSION, /for \(const fact of decision\.remember\) \{\n\s+if \(await rememberLine\(/, "the writes are not sequential");
  assert.ok(!/Promise\.all\(\n\s+decision\.remember\.map/.test(SESSION), "the parallel write is back, and with it the same-turn duplicate");
});

test("🔴🔴🔴 the canvas does not announce that memory was updated", () => {
  // Owner, 2026-08-27: *"remove 'memory updated', that should be in the background."*
  //
  // 🔴 THIS INVERTS THE TWO GUARDS IT REPLACES, AND THE REVERSAL IS HIS. They held a notice that
  // existed to answer *"does memory work like it does in ChatGPT where you basically can see the
  // memory prompt and the updates?"* (2026-08-24) — that it must never print the remembered
  // sentence, that it must open Settings rather than navigate, that it must be dismissible. Every
  // one of those was about making the notice safe. The ruling now is that the notice should not be
  // there at all: it interrupts somebody mid-task to report a background bookkeeping step they did
  // not ask about and cannot act on from there.
  //
  // 🔴 THE REMEMBERING IS UNTOUCHED, AND THE TEST ABOVE STILL HOLDS IT. `memoryNotice` is still
  // counted from real writes; what is gone is the surface reading it out. Settings › Memory lists
  // everything with a delete beside each, which is where a person goes when they want to know.
  const canvas = strip(readFileSync(new URL("../../components/workspace/learn/learning-canvas.tsx", import.meta.url), "utf8"));
  assert.ok(!/Memory updated/.test(canvas), "the canvas announces memory writes again");
  assert.ok(!/See what Nemesis remembers/.test(canvas), "the notice's link is back on the canvas");
  assert.ok(!/session\.memoryNotice/.test(canvas), "the canvas is reading the notice count again");
  assert.ok(!/clearMemoryNotice/.test(canvas), "a dismiss for a notice that no longer exists");
});

