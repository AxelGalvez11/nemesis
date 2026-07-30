import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { resolveArtifacts, type OutputCarrier } from "./artifact-timeline.ts";
import type { ChatOutput } from "./chat-thread.ts";

const rec = (partial: Partial<ChatOutput> = {}): ChatOutput => ({
  id: "rec-1",
  kind: "recording",
  title: "Recording · Jul 30",
  ...partial,
});

const msg = (...outputs: ChatOutput[]): OutputCarrier => ({ outputs });

// The exact shape the owner hit on 2026-07-30: save writes a pending card,
// twenty seconds later the enhance pass writes a finished one, and the
// thread-level chip is updated in place. Three copies, one recording.
Deno.test("one recording draws ONE card, at the newest state, in the first place it appeared", () => {
  const pending = rec({ polish: "pending" });
  const finished = rec({ notes: "Cell division has four phases.", polish: "done" });

  const resolved = resolveArtifacts([msg(pending), msg(finished)], [finished]);

  assertEquals(resolved.perMessage[0]?.length, 1);
  // Drawn under the FIRST message — a card that jumps to a later message when
  // the notes land reads as a glitch, not as progress.
  assertEquals(resolved.perMessage[1], []);
  // ...but showing the FINISHED state, so the pulse stops.
  assertEquals(resolved.perMessage[0]?.[0]?.polish, "done");
  assertEquals(resolved.perMessage[0]?.[0]?.notes, "Cell division has four phases.");
  // And the header does not draw a third copy of the same thing.
  assertEquals(resolved.header, []);
});

Deno.test("a still-processing recording keeps its pending state, so the card can pulse", () => {
  const pending = rec({ polish: "pending" });
  const resolved = resolveArtifacts([msg(pending)], [pending]);
  assertEquals(resolved.perMessage[0]?.[0]?.polish, "pending");
  assertEquals(resolved.header, []);
});

// The regression the old code had: an assistant message is a historical
// record, so the "pending" copy written at save time stays pending forever.
// Without the newest-state pass this card would still say "Transcribing…"
// after the notes existed.
Deno.test("the thread chip wins over a stale pending copy frozen in a message", () => {
  const staleInMessage = rec({ polish: "pending" });
  const currentChip = rec({ notes: "Done.", polish: "done" });

  const resolved = resolveArtifacts([msg(staleInMessage)], [currentChip]);

  assertEquals(resolved.perMessage[0]?.[0]?.polish, "done");
  assertEquals(resolved.perMessage[0]?.[0]?.notes, "Done.");
});

Deno.test("a chip no message carries still draws in the header", () => {
  // Web's recorder writes the thread chip without ever writing a chat message;
  // dropping it here would make that recording invisible on the phone.
  const webRecording = rec({ id: "rec-web", polish: "done" });
  const resolved = resolveArtifacts([], [webRecording]);
  assertEquals(resolved.header.length, 1);
  assertEquals(resolved.header[0]?.id, "rec-web");
});

Deno.test("different artifacts in one message all draw, in order", () => {
  const deck = rec({ id: "a", kind: "flashcards", title: "Krebs cycle" });
  const test = rec({ id: "b", kind: "test", title: "Limits" });
  const resolved = resolveArtifacts([msg(deck, test)], []);
  assertEquals(resolved.perMessage[0]?.map((output) => output.id), ["a", "b"]);
});

Deno.test("a message with no outputs resolves to an empty list, not undefined", () => {
  const resolved = resolveArtifacts([{}, msg(rec())], []);
  assertEquals(resolved.perMessage[0], []);
  assertEquals(resolved.perMessage.length, 2);
});

// Defensive: an id-less artifact cannot be tracked across copies. Showing it
// twice is a smaller failure than dropping the only card the student has.
Deno.test("an artifact with no id is drawn where it was found rather than dropped", () => {
  const idless = { kind: "recording", title: "No id" } as unknown as ChatOutput;
  const resolved = resolveArtifacts([msg(idless), msg(idless)], []);
  assertEquals(resolved.perMessage[0]?.length, 1);
  assertEquals(resolved.perMessage[1]?.length, 1);
});

Deno.test("the header keeps its own order and drops only what a message already drew", () => {
  const drawn = rec({ id: "drawn" });
  const first = rec({ id: "chip-1" });
  const second = rec({ id: "chip-2" });
  const resolved = resolveArtifacts([msg(drawn)], [first, drawn, second]);
  assertEquals(resolved.header.map((output) => output.id), ["chip-1", "chip-2"]);
});
