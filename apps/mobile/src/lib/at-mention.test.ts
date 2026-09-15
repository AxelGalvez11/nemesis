import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { atMentionState, removeAtMention } from "./at-mention.ts";

Deno.test("a bare @ as the first character is active with an empty query", () => {
  const state = atMentionState("@");
  assertEquals(state.active, true);
  assertEquals(state.at, 0);
  assertEquals(state.query, "");
});

Deno.test("@ after a space is active, filtering on what follows", () => {
  const state = atMentionState("hello @Cou");
  assertEquals(state.active, true);
  assertEquals(state.at, 6);
  assertEquals(state.query, "cou");
});

Deno.test("@ with no space before it is NOT a trigger — an email, not a mention", () => {
  assertEquals(atMentionState("hello@cou").active, false);
});

Deno.test("a space after the query closes the picker", () => {
  assertEquals(atMentionState("@course tell me about").active, false);
});

Deno.test("the LAST @ run wins when the text has more than one", () => {
  const state = atMentionState("@a stray earlier @b");
  assertEquals(state.active, true);
  assertEquals(state.query, "b");
  assertEquals(state.at, 17);
});

Deno.test("removeAtMention strips the trigger and keeps everything before it", () => {
  assertEquals(removeAtMention("hello @cou", atMentionState("hello @cou")), "hello ");
  assertEquals(removeAtMention("@course", atMentionState("@course")), "");
});

Deno.test("removeAtMention is a no-op when nothing is active", () => {
  const state = atMentionState("just a normal question");
  assertEquals(removeAtMention("just a normal question", state), "just a normal question");
});
