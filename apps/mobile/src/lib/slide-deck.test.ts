import { assertEquals } from "jsr:@std/assert";
import { parseSlideDeck } from "./slide-deck.ts";

Deno.test("parseSlideDeck reads structured Library slide artifacts", () => {
  const slides = parseSlideDeck(`---
nemesis_artifact: slides
---
# Deck

## 1. First concept

- One
- Two

### Speaker notes

Explain this carefully.

---

## 2. Second concept

- Three`);
  assertEquals(slides, [
    { bullets: ["One", "Two"], speakerNotes: "Explain this carefully.", title: "First concept" },
    { bullets: ["Three"], speakerNotes: "", title: "Second concept" },
  ]);
});
