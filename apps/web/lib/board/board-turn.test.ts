import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { THINKING_STANCE } from "@nemesis/shared";

import { boardWireMessages } from "./board-turn";
import { visibleAnswer } from "./board-protocol";
import { DIAGRAM_INSTRUCTION } from "@/lib/learn/diagram-instruction";
import { boardCitableFiles, boardSourceForFile, groundedSources, sourceOrdinalOf } from "./board-grounding";
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

  // Owner 2026-09-04, of wondering's pictures: "can we implement visuals similar?" The renderer was
  // already under every card; the instruction was only in the chat, so the board wrote prose.
  it("forbids a quiz written as prose, because the questions are a card now", () => {
    const [system] = boardWireMessages({ message: "Teach me this then quiz me", history: [] });
    assert.match(system?.content ?? "", /Never put questions to the learner as a numbered list/, "the prose-quiz rule is missing");
    assert.match(system?.content ?? "", /prepared for them separately/, "the model is not told the questions are handled elsewhere");
    // 🔴 MEASURED: with only the no-list half, the model announced the quiz and asked question one
    // in prose, beside a card holding the same six questions.
    assert.match(system?.content ?? "", /never announce one/, "the no-announcing half of the rule is missing");
    // 🔴 AND IT MUST NOT DESCRIBE THE PAGE EITHER (screen-positions.ts): told about the card, the
    // model told the learner about the card.
    assert.match(system?.content ?? "", /Never mention any card, panel or button/, "the no-describing-the-screen rule is missing");
    assert.ok(!/test card is made beside this one/.test(system?.content ?? ""), "the prompt still hands the model a sentence to repeat");
  });

  it("tells the card it may draw, in the same words the chat uses", () => {
    const [system] = boardWireMessages({ message: "How does a bill become law?", history: [] });
    assert.ok(system?.content.includes(DIAGRAM_INSTRUCTION), "the drawing rules are missing from the board");
    assert.match(DIAGRAM_INSTRUCTION, /mermaid/, "the shared rule must name the notation the renderer draws");
  });
});

describe("a diagram arriving one token at a time is not shown as syntax", () => {
  it("masks an unfinished fence while streaming and leaves a finished one alone", () => {
    const half = "Here is the process.\n\n```mermaid\nflowchart TD\n  A[\"Bill\"] --> B";
    assert.equal(visibleAnswer(half, true), "Here is the process.\n\n_Drawing a diagram…_");
    const whole = "Here is the process.\n\n```mermaid\nflowchart TD\n  A --> B\n```";
    assert.equal(visibleAnswer(whole, true), whole, "a closed fence is a diagram and is left alone");
    assert.equal(visibleAnswer(half, false), half, "once the stream ends the learner sees what arrived");
  });

  it("leaves ordinary code fences alone, because only mermaid draws", () => {
    const code = "Try this:\n\n```ts\nconst a = 1;";
    assert.equal(visibleAnswer(code, true), code);
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
    const packet = boardWireMessages({ message: "What is a hexamer?", history: [], materialContext: "### SOURCE s1: Lecture\n\n[s1:e1] Insulin forms a hexamer around zinc." });
    const [system, material] = packet;
    assert.ok(system?.content.includes(MATERIAL_CITATION_RULE), "the [s1:e4] rule is missing from the system line");
    // The material is its own system message, the chat's shape (turnRouterMessages).
    assert.equal(material?.role, "system");
    assert.ok(material?.content.startsWith(MATERIAL_HEADER), "the packet must open with the chat's header");
    assert.ok(material?.content.includes("[s1:e1] Insulin forms a hexamer"), "the packet is missing");
    assert.equal(packet.length, 3, "system, material, user");
    const bare = boardWireMessages({ message: "Why?", history: [] });
    assert.equal(bare.length, 2, "no material, no second system message");
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

describe("source ids are claimed, never counted", () => {
  it("a source filed before grounding takes the lowest FREE id, never one a stored source holds", () => {
    const stored = { id: "s1", title: "Stored", kind: "pdf", excerpts: [{ id: "s1:e1", label: null, text: "kept" }] };
    const sources = [
      { id: "old", type: "pdf" as const, name: "Old", content: "Consideration is the price of a promise.", status: "ready" as const, previewUrls: [], position: { x: 0, y: 0 }, width: 640 },
      { id: "new", type: "pdf" as const, name: "New", content: "x", grounded: stored, status: "ready" as const, previewUrls: [], position: { x: 0, y: 0 }, width: 640 },
    ];
    const grounded = groundedSources(sources);
    assert.deepEqual(grounded.map((source) => source.id), ["s2", "s1"], "the built id skipped the stored s1");
    assert.equal(sourceOrdinalOf(sources[1]!), 1);
    assert.equal(sourceOrdinalOf(sources[0]!), 0);
  });
});

describe("the three readers of the source list walk it the same way", () => {
  it("a source still processing in the middle does not shift which file a pill opens", () => {
    const base = { type: "pdf" as const, previewUrls: [], position: { x: 0, y: 0 }, width: 640 };
    const sources = [
      { ...base, id: "a", name: "A", content: "Consideration must move from the promisee.", status: "ready" as const },
      { ...base, id: "busy", name: "Busy", content: "", status: "processing" as const },
      { ...base, id: "c", name: "C", content: "Past consideration is no consideration.", status: "ready" as const },
    ];
    const grounded = groundedSources(sources);
    assert.deepEqual(grounded.map((source) => source.id), ["s1", "s2"]);
    assert.deepEqual(boardCitableFiles(sources).map((file) => file.title), ["A", "C"]);
    assert.equal(boardSourceForFile(sources, "s2")?.id, "c", "the second pill opens C, not the processing source");
    assert.equal(boardSourceForFile(sources, "s1")?.id, "a");
    assert.equal(boardSourceForFile(sources, "s3"), null);
  });
});
