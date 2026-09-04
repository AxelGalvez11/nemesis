import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { THINKING_STANCE } from "@nemesis/shared";

import { boardWireMessages, pastedSources } from "./board-turn";
import { CONCEPT_INSTRUCTION, PROTOCOL_INSTRUCTION } from "./board-protocol";

describe("a board turn goes out as one packet", () => {
  it("carries the stance, the key-term rule and the suggestion protocol in the system line", () => {
    const [system] = boardWireMessages({ message: "What is a hexamer?", history: [] });
    assert.equal(system?.role, "system");
    assert.ok(system?.content.includes(THINKING_STANCE), "the stance is missing");
    assert.ok(system?.content.includes(CONCEPT_INSTRUCTION), "the key-term rule is missing");
    assert.ok(system?.content.includes(PROTOCOL_INSTRUCTION), "the [[SUGGEST]] protocol is missing");
    assert.ok(!/—/.test(system?.content ?? ""), "the prompt bans em dashes and must not carry one");
  });

  it("quotes the selected passage ahead of a branch question, and plain questions ride bare", () => {
    const branch = boardWireMessages({ message: "Why?", history: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }], contextExcerpt: "has no real peak" });
    assert.equal(branch.length, 4);
    assert.match(branch[3]?.content ?? "", /> has no real peak/);
    assert.match(branch[3]?.content ?? "", /Their question about it: Why\?/);
    const plain = boardWireMessages({ message: "Why?", history: [] });
    assert.equal(plain[1]?.content, "Why?");
  });

  it("pastes at most four ready sources, truncated to the reference's limits", () => {
    const sources = [
      { id: "a", type: "pdf" as const, name: "A", content: "x".repeat(300_000), status: "ready" as const, previewUrls: [], position: { x: 0, y: 0 }, width: 640 },
      { id: "b", type: "pdf" as const, name: "B", content: "short", status: "processing" as const, previewUrls: [], position: { x: 0, y: 0 }, width: 640 },
    ];
    const pasted = pastedSources(sources, ["a", "b"]);
    assert.equal(pasted.length, 1, "a source still processing does not ride");
    assert.ok(pasted[0]!.content.length <= 240_000);
    assert.ok(pasted[0]!.content.endsWith("[This source was truncated to fit the canvas context window.]"));
  });
});
