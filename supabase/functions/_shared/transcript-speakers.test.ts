import { assertEquals, assertFalse, assert } from "jsr:@std/assert@1";

import { formatDiarizedTranscript, utterancesOf } from "./transcript-speakers.ts";

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
