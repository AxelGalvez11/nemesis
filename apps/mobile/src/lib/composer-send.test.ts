import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { composerAction } from "./composer-send.ts";

Deno.test("an empty composer offers the record button", () => {
  assertEquals(composerAction(""), "record");
  assertEquals(composerAction("   \n "), "record");
});

Deno.test("typed words offer send", () => {
  assertEquals(composerAction("what is this?"), "send");
});

// THE REGRESSION THE OWNER HIT. A photo attached to an empty composer used to
// leave the record button showing, so the picture could not be sent at all.
Deno.test("an attachment makes an EMPTY composer sendable", () => {
  assertEquals(composerAction("", { attached: true }), "send");
  assertEquals(composerAction("  ", { attached: true }), "send");
});

Deno.test("an attachment plus a question is still send", () => {
  assertEquals(composerAction("which step is wrong?", { attached: true }), "send");
});

// The button must not turn back into "record" while the turn is going out —
// for a photo the attachment is still on screen the whole time it uploads.
Deno.test("mid-flight it stays the send button, marked sending", () => {
  assertEquals(composerAction("", { attached: true, sending: true }), "sending");
  assertEquals(composerAction("a question", { sending: true }), "sending");
});

// 🔴 THIS TEST ASSERTED THE OPPOSITE AND THE OPPOSITE WAS THE BUG. It read
// "sending with nothing drafted is still record", on the reasoning that nothing to
// send means nothing to wait for. But send() empties the composer the moment it
// fires, so "nothing drafted while sending" is the state of EVERY ordinary turn —
// and under the old rule the button became the Record circle mid-answer, which is
// both useless and destructive to tap. A turn in flight is precisely when Stop has
// to exist.
Deno.test("an emptied composer mid-flight still shows the button, as Stop", () => {
  assertEquals(composerAction("", { sending: true }), "sending");
  assertEquals(composerAction("", { attached: false, sending: true }), "sending");
});
