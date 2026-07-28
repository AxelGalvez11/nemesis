import { assertEquals, assertFalse, assert } from "jsr:@std/assert@1";

import { formatDiarizedTranscript, utterancesFromWords, utterancesOf } from "./transcript-speakers.ts";

const u = (speaker: string, text: string) => ({ speaker, text });

Deno.test("a solo lecture gets NO speaker labels — that is the common case and they are noise", () => {
  const flat = "The Krebs cycle runs in the matrix. It yields three NADH.";
  const out = formatDiarizedTranscript([u("A", "The Krebs cycle runs in the matrix."), u("A", "It yields three NADH.")], flat);
  assertEquals(out, flat);
  assertFalse(out.includes("Speaker"));
});

Deno.test("a question from the room is attributed, so a wrong guess is never read as fact", () => {
  const out = formatDiarizedTranscript(
    [u("A", "Oxygen is not used directly."), u("B", "So it is anaerobic?"), u("A", "No — it stops without oxygen.")],
    "Oxygen is not used directly. So it is anaerobic? No — it stops without oxygen.",
  );
  assertEquals(
    out,
    "Speaker A: Oxygen is not used directly.\n\nSpeaker B: So it is anaerobic?\n\nSpeaker A: No — it stops without oxygen.",
  );
});

Deno.test("consecutive turns by one speaker merge, so an hour is not hundreds of one-line blocks", () => {
  const out = formatDiarizedTranscript(
    [u("A", "First point."), u("A", "Second point."), u("B", "A question."), u("A", "The answer.")],
    "flat",
  );
  assertEquals(out, "Speaker A: First point. Second point.\n\nSpeaker B: A question.\n\nSpeaker A: The answer.");
  // Four utterances, three blocks — the merge is what keeps the notes pass cheap.
  assertEquals(out.split("\n\n").length, 3);
});

Deno.test("blocks are separated by a BLANK line, the break the notes planner prefers", () => {
  const out = formatDiarizedTranscript([u("A", "One."), u("B", "Two.")], "flat");
  assert(out.includes("\n\n"));
});

Deno.test("no utterances at all falls back to the provider's flat text", () => {
  assertEquals(formatDiarizedTranscript([], "  the plain transcript  "), "the plain transcript");
});

Deno.test("an unlabelled speaker in a multi-speaker recording is named, never left bare", () => {
  const out = formatDiarizedTranscript([u("A", "Hello."), u("", "Who am I?")], "flat");
  assert(out.includes("Speaker ?: Who am I?"));
});

Deno.test("utterances with no flat text to fall back on are still joined rather than lost", () => {
  assertEquals(formatDiarizedTranscript([u("A", "Only line.")], ""), "Only line.");
});

Deno.test("utterancesOf survives anything the provider might send", () => {
  assertEquals(utterancesOf(undefined), []);
  assertEquals(utterancesOf("not an array"), []);
  assertEquals(utterancesOf([null, 3, { speaker: "A" }]), []);
  // A blank or whitespace-only utterance contributes nothing rather than an
  // empty "Speaker A: " line.
  assertEquals(utterancesOf([{ speaker: "A", text: "   " }]), []);
  assertEquals(utterancesOf([{ speaker: " A ", text: " hi " }]), [{ speaker: "A", text: "hi" }]);
  // A non-string speaker is tolerated; the formatter names it.
  assertEquals(utterancesOf([{ speaker: 1, text: "hi" }]), [{ speaker: "", text: "hi" }]);
});

// ---- word-level diarization (xAI) -----------------------------------------
// xAI labels WORDS, not turns. Grouping them is what lets one formatter serve
// both providers instead of each growing its own.

Deno.test("word-level speakers group into the same utterances AssemblyAI would send", () => {
  const words = [
    { speaker: "A", word: "The" }, { speaker: "A", word: "matrix" },
    { speaker: "B", word: "Is" }, { speaker: "B", word: "that" }, { speaker: "B", word: "cytosol?" },
    { speaker: "A", word: "No." },
  ];
  assertEquals(utterancesFromWords(words), [
    { speaker: "A", text: "The matrix" },
    { speaker: "B", text: "Is that cytosol?" },
    { speaker: "A", text: "No." },
  ]);
});

Deno.test("xAI's NUMERIC speakers become letters, so no student reads 'Speaker 0'", () => {
  // The shape xAI actually sends: `speaker` is a zero-based integer, not a
  // letter. Every other test here uses strings, which is how the raw
  // "Speaker 0:" prefix went unnoticed.
  const words = [
    { speaker: 0, word: "Glycolysis" }, { speaker: 0, word: "is" }, { speaker: 0, word: "cytosolic." },
    { speaker: 1, word: "Mitochondrial?" },
  ];
  assertEquals(utterancesFromWords(words), [
    { speaker: "A", text: "Glycolysis is cytosolic." },
    { speaker: "B", text: "Mitochondrial?" },
  ]);
  const out = formatDiarizedTranscript(utterancesFromWords(words), "flat");
  assert(out.includes("Speaker A:"));
  assert(out.includes("Speaker B:"));
  assert(!out.includes("Speaker 0"));
});

Deno.test("a speaker index past Z keeps its number rather than inventing a letter", () => {
  assertEquals(utterancesFromWords([{ speaker: 26, word: "hi" }]), [{ speaker: "26", text: "hi" }]);
  // Negative or fractional indices are not letters either — they pass through
  // rather than wrapping to a wrong letter via arithmetic.
  assertEquals(utterancesFromWords([{ speaker: -1, word: "hi" }]), [{ speaker: "-1", text: "hi" }]);
});

Deno.test("a word-labelled solo lecture still gets no labels", () => {
  const flat = "One voice, start to finish.";
  const words = [{ speaker: "A", word: "One" }, { speaker: "A", word: "voice" }];
  assertEquals(formatDiarizedTranscript(utterancesFromWords(words), flat), flat);
});

Deno.test("a word-labelled question is attributed once grouped", () => {
  const words = [
    { speaker: "A", word: "Glycolysis" }, { speaker: "A", word: "is" }, { speaker: "A", word: "cytosolic." },
    { speaker: "B", word: "Mitochondrial?" },
  ];
  const out = formatDiarizedTranscript(utterancesFromWords(words), "Glycolysis is cytosolic. Mitochondrial?");
  assert(out.includes("Speaker A: Glycolysis is cytosolic."));
  assert(out.includes("Speaker B: Mitochondrial?"));
});

Deno.test("utterancesFromWords survives anything the provider might send", () => {
  assertEquals(utterancesFromWords(undefined), []);
  assertEquals(utterancesFromWords("not an array"), []);
  assertEquals(utterancesFromWords([null, 7, { speaker: "A" }]), []);
  assertEquals(utterancesFromWords([{ speaker: "A", word: "  " }]), []);
  // `text` is accepted as well as `word`, so a renamed field cannot silently
  // produce an empty transcript.
  assertEquals(utterancesFromWords([{ speaker: "A", text: "hi" }]), [{ speaker: "A", text: "hi" }]);
  // A numeric speaker id is normal for word-level diarization, and is lettered
  // so it prints the same way AssemblyAI's already does.
  assertEquals(utterancesFromWords([{ speaker: 0, word: "hi" }, { speaker: 1, word: "there" }]), [
    { speaker: "A", text: "hi" },
    { speaker: "B", text: "there" },
  ]);
});
