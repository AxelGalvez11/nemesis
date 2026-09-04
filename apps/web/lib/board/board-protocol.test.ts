import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveCardSummary, firstImage, readSuggestions, readSummary, visibleAnswer } from "./board-protocol";

const ANSWER =
  "Insulin aspart is a **rapid-acting** analogue.\n\nIt peaks in 1 to 3 hours.\n\n" +
  "[[SUMMARY\ntitle: Insulin aspart timing\nsummary: Aspart acts fast and peaks within three hours.\n]]\n" +
  "[[SUGGEST\nfollowUps:\n- How is it dosed at meals?\n- What shortens its onset?\nbranches:\n- Compare it with glargine\nnewThreads:\n- Insulin pump basics\n]]";

describe("board protocol strips the machine blocks and reads them", () => {
  it("shows only the prose", () => {
    assert.equal(visibleAnswer(ANSWER, false), "Insulin aspart is a **rapid-acting** analogue.\n\nIt peaks in 1 to 3 hours.");
  });

  it("cuts a half-arrived block while streaming, and leaves a finished text alone", () => {
    assert.equal(visibleAnswer("The answer.\n\n[[SUGGEST\nfollowUps:\n- How", true), "The answer.");
    assert.equal(visibleAnswer("The answer.\n\n[[SUMM", true), "The answer.");
    assert.equal(visibleAnswer("Plain prose with no blocks.", true), "Plain prose with no blocks.");
  });

  it("reads the three suggestion lists", () => {
    assert.deepEqual(readSuggestions(ANSWER), {
      followUps: ["How is it dosed at meals?", "What shortens its onset?"],
      branches: ["Compare it with glargine"],
      newThreads: ["Insulin pump basics"],
    });
  });

  it("reads title and summary, and gives nothing when they are absent", () => {
    assert.deepEqual(readSummary(ANSWER), {
      title: "Insulin aspart timing",
      summary: "Aspart acts fast and peaks within three hours.",
    });
    assert.deepEqual(readSummary("no blocks here"), {});
    assert.deepEqual(readSuggestions("no blocks here"), { followUps: [], branches: [], newThreads: [] });
  });

  it("flattens the last good answer into a one-line summary", () => {
    const messages = [
      { role: "user", content: "q" },
      { role: "assistant", content: "# Heading\n\n- **bold** point\n- [link](http://x)\n\n```js\ncode\n```" },
      { role: "assistant", content: "broken", isError: true },
    ];
    assert.equal(deriveCardSummary(messages), "Heading bold point link");
    assert.equal(deriveCardSummary([{ role: "user", content: "only a question" }]), "");
  });

  it("finds the first picture in a card", () => {
    assert.deepEqual(firstImage([{ content: "text ![A chart](https://x/y.png) more" }]), { alt: "A chart", url: "https://x/y.png" });
    assert.equal(firstImage([{ content: "no picture" }]), null);
  });
});
