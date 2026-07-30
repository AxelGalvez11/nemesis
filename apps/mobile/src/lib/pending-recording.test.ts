import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isPendingRecordingMessage, withoutPendingRecordings } from "./chat-threads.ts";
import type { ChatMsg } from "./chat-thread.ts";

const message = (over: Partial<ChatMsg>): ChatMsg => ({
  at: "2026-07-30T22:23:00.000Z",
  content: "hello",
  role: "assistant",
  ...over,
});

// THE REGRESSION THIS GUARDS. chat_messages is insert-only, so a placeholder that
// reaches the cloud can never be replaced by its rewritten self — the next poll
// drags the frozen "Writing up your notes." back and takes the notes with it.
Deno.test("a pending recording placeholder is never persisted", () => {
  const placeholder = message({
    content: "Recording saved. Writing up your notes.",
    outputs: [{ id: "a1", kind: "recording", title: "Recording · Jul 30", polish: "pending" }],
  });
  assertEquals(isPendingRecordingMessage(placeholder), true);
  assertEquals(withoutPendingRecordings([placeholder]).length, 0);
});

// The whole point: once written up, it is an ordinary message and MUST persist.
Deno.test("the resolved recording message is persisted normally", () => {
  const resolved = message({
    content: "Recording saved and written up.",
    outputs: [{ id: "a1", kind: "recording", title: "Collecting the car", notes: "…", polish: "done" }],
  });
  assertEquals(isPendingRecordingMessage(resolved), false);
  assertEquals(withoutPendingRecordings([resolved]).length, 1);
});

// The filter runs over every save, so it must not eat anything else.
Deno.test("ordinary messages and other artifacts are untouched", () => {
  const list = [
    message({ content: "what is a tort?", role: "user" }),
    message({ content: "Here you go.", outputs: [{ id: "d1", kind: "flashcards", title: "Torts" }] }),
    message({ content: "A recording with no state at all", outputs: [{ id: "r9", kind: "recording", title: "Old" }] }),
  ];
  assertEquals(withoutPendingRecordings(list).length, 3);
});

// The case that actually pushed it to the cloud: an ordinary chat turn sent while
// the write-up was still running persists the WHOLE array, placeholder included.
Deno.test("a chat turn sent mid-write-up does not drag the placeholder along", () => {
  const list = [
    message({
      content: "Recording saved. Writing up your notes.",
      outputs: [{ id: "a1", kind: "recording", title: "Recording · Jul 30", polish: "pending" }],
    }),
    message({ content: "can you quiz me?", role: "user" }),
  ];
  const kept = withoutPendingRecordings(list);
  assertEquals(kept.length, 1);
  assertEquals(kept[0].content, "can you quiz me?");
});
