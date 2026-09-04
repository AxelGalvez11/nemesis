import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { THINKING_STANCE } from "@nemesis/shared";

import { boardWireMessages } from "./board-turn";
import { boardCitableFiles, groundedSources } from "./board-grounding";
import { MATERIAL_CITATION_RULE, MATERIAL_HEADER } from "@/lib/learn/turn-router";
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
    assert.ok(plain[1]?.content.startsWith("Why?"), "the question leads the user turn");
    assert.match(plain[1]?.content ?? "", /\[\[SUMMARY\]\] and \[\[SUGGEST\]\] blocks/, "the reminder rides the user turn");
  });

  it("carries the material packet under the chat's header and the chat's citation rule", () => {
    const [system] = boardWireMessages({ message: "What is a hexamer?", history: [], materialContext: "### SOURCE s1 — Lecture\n\n[s1:e1] Insulin forms a hexamer around zinc." });
    assert.ok(system?.content.includes(MATERIAL_HEADER), "the header is missing");
    assert.ok(system?.content.includes(MATERIAL_CITATION_RULE), "the [s1:e4] rule is missing");
    assert.ok(system?.content.includes("[s1:e1] Insulin forms a hexamer"), "the packet is missing");
    const bare = boardWireMessages({ message: "Why?", history: [] });
    assert.ok(!bare[0]?.content.includes(MATERIAL_HEADER), "no material, no header");
  });

  it("gives a source dropped before grounding the chat's shape from its text, with stable ids", () => {
    const sources = [
      { id: "a", type: "pdf" as const, name: "A", content: "Consideration is the price of a promise. It must move from the promisee.", status: "ready" as const, previewUrls: [], position: { x: 0, y: 0 }, width: 640 },
      { id: "b", type: "pdf" as const, name: "B", content: "short", status: "processing" as const, previewUrls: [], position: { x: 0, y: 0 }, width: 640 },
    ];
    const grounded = groundedSources(sources);
    assert.equal(grounded.length, 1, "a source still processing does not ride");
    assert.equal(grounded[0]?.id, "s1");
    assert.ok((grounded[0]?.excerpts.length ?? 0) > 0, "the text became excerpts");
    assert.match(grounded[0]?.excerpts[0]?.id ?? "", /^s1:e\d+$/, "excerpt ids are the chat's");
    assert.deepEqual(boardCitableFiles(sources), [{ id: "s1", title: "A", librarySourceId: null }]);
  });
});
