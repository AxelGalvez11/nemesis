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

// Nothing to send means nothing to wait for: sending must not conjure a button.
Deno.test("sending with nothing drafted is still record", () => {
  assertEquals(composerAction("", { sending: true }), "record");
});
