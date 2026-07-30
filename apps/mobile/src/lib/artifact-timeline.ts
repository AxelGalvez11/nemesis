// WHICH card draws WHERE, and in WHAT state — the pure half of the chat
// transcript's artifact rendering (artifact-card.ts is the pure half of what a
// card SAYS).
//
// Owner 2026-07-30, after saving a recording: "the chat went back to blank …
// it should show a processing artifact with a pulsing animation, not just a
// regular artifact."
//
// The cloud rows for that save were perfect — the artifact landed with
// `polish: "pending"` and the finished notes replaced it 23 seconds later. The
// problem was entirely in what the phone drew, and it drew too much:
//
//   * the THREAD-level chip row (chat_threads.meta.outputs, kept current in
//     place by the enhance pass), plus
//   * a card under "Recording saved. Your notes are being prepared.", plus
//     later
//   * a card under "Your polished recording notes are ready in the Library."
//
// Three cards for one recording, two of them frozen at whatever state they
// were written with. The first one in particular keeps saying "Transcribing
// and polishing notes…" long after the notes exist, because a chat message is
// a historical record: nothing rewrites it when the work finishes.
//
// So this module collapses the three into ONE card that changes state in
// place:
//
//   1. ONE state per artifact id — the newest known one. Later messages beat
//      earlier ones, and the thread-level chip beats them all, because it is
//      the only copy the enhance pass rewrites (api/chat.ts writeChipEntry).
//   2. ONE position per artifact id — the FIRST message that carries it. Not
//      the last: a card that vanishes from one message and reappears under a
//      later one reads as a glitch, and the whole point is that the student
//      watches a single card settle.
//   3. The header keeps only what no message has already drawn — which, for a
//      recording saved on this phone, is nothing.
//
// Pure so both rules are testable without a device (lib/artifact-timeline.test.ts).

import type { ChatOutput } from "./chat-thread.ts";

/** Just the shape this module reads off a ChatMsg — so a test can pass plain
 *  objects and a caller can pass real messages. */
export interface OutputCarrier {
  outputs?: ChatOutput[];
}

export interface ResolvedArtifacts {
  /** Parallel to the messages passed in: what message i should draw. */
  perMessage: ChatOutput[][];
  /** Thread-level chips no message already draws. */
  header: ChatOutput[];
}

/** An artifact with no id cannot be tracked across copies, so it is drawn
 *  exactly where it was found and never deduplicated. That is the safe
 *  direction: showing one card twice is a smaller failure than dropping the
 *  only card a student has. */
function trackable(output: ChatOutput): boolean {
  return typeof output.id === "string" && output.id.length > 0;
}

/**
 * Resolve a thread's artifacts to one card each, at its newest known state.
 *
 * `threadOutputs` is `chat_threads.meta.outputs` — the row the recording
 * enhance pass updates in place — so it wins any disagreement about state.
 * Order within a message is preserved; order between messages is the
 * transcript's own.
 */
export function resolveArtifacts(
  messages: readonly OutputCarrier[],
  threadOutputs: readonly ChatOutput[] = [],
): ResolvedArtifacts {
  // Pass 1 — newest state per id. Scan order IS precedence order, ending with
  // the thread chips, so a "pending" copy frozen in an old message can never
  // win over the resolved one.
  const newest = new Map<string, ChatOutput>();
  for (const message of messages) {
    for (const output of message.outputs ?? []) {
      if (trackable(output)) newest.set(output.id, output);
    }
  }
  for (const output of threadOutputs) {
    if (trackable(output)) newest.set(output.id, output);
  }

  // Pass 2 — first position wins. `drawn` is what has already been placed, so
  // a repeat of the same id later in the transcript renders nothing.
  const drawn = new Set<string>();
  const perMessage: ChatOutput[][] = messages.map((message) => {
    const cards: ChatOutput[] = [];
    for (const output of message.outputs ?? []) {
      if (!trackable(output)) {
        cards.push(output);
        continue;
      }
      if (drawn.has(output.id)) continue;
      drawn.add(output.id);
      cards.push(newest.get(output.id) ?? output);
    }
    return cards;
  });

  const header = threadOutputs.filter((output) => !trackable(output) || !drawn.has(output.id));
  return { header, perMessage };
}
