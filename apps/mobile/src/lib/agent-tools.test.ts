// Deno unit tests (repo convention) for the phone chat's workspace tool catalog.
// Run: deno test --no-check apps/mobile/src/lib/agent-tools.test.ts
//
// The catalog tests are the ones that matter here. A schema mistake does not throw
// — it produces a model that calls a tool nobody built, or a tool the model can
// never call correctly because a required field is not in its properties. Both
// surface to the student as "it just talked at me", the exact complaint this whole
// lane exists to fix, and neither is visible in a typecheck.
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AGENT_TOOL_NAMES,
  AGENT_TOOLS,
  clip,
  deckNameParts,
  isAgentToolName,
  matchDeckName,
  MAX_CARDS_PER_CALL,
  MAX_NOTE_CHARS,
  parseToolArgs,
  usableCards,
  usableSlides,
} from "./agent-tools.ts";
import { EXAM_ITEM_RULES_SHORT } from "./item-writing.ts";
import { phaseLabel } from "./thinking-phase.ts";

interface Schema {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: { type: string; properties: Record<string, unknown>; required?: readonly string[] };
  };
}

const SCHEMAS = AGENT_TOOLS as readonly unknown[] as readonly Schema[];

Deno.test("the advertised tools and the name tuple are the same set", () => {
  // The tuple drives the handler map's key type in api/agentTools.ts, so a schema
  // whose name is missing from it is a tool the model can call and nothing runs.
  assertEquals(SCHEMAS.map((schema) => schema.function.name).sort(), [...AGENT_TOOL_NAMES].sort());
});

Deno.test("no tool name appears twice", () => {
  const names = SCHEMAS.map((schema) => schema.function.name);
  assertEquals(new Set(names).size, names.length);
});

Deno.test("every required field is actually declared as a property", () => {
  // A required field the model cannot see is a tool that fails every time it is
  // called, and the failure looks like the model's fault.
  for (const schema of SCHEMAS) {
    for (const field of schema.function.parameters.required ?? []) {
      assertEquals(
        Object.hasOwn(schema.function.parameters.properties, field),
        true,
        `${schema.function.name} requires '${field}' but does not declare it`,
      );
    }
  }
});

Deno.test("every tool is shaped the way the provider expects", () => {
  for (const schema of SCHEMAS) {
    assertEquals(schema.type, "function", schema.function?.name);
    assertEquals(schema.function.parameters.type, "object", schema.function.name);
    assertEquals(typeof schema.function.description, "string", schema.function.name);
    // The description is the ONLY steering there is — tool_choice is never sent,
    // so a thin one means a tool the model never reaches for.
    assertEquals(schema.function.description.length > 30, true, schema.function.name);
  }
});

Deno.test("every tool has a plain-English line for the thinking preview", () => {
  // Without one the student watches "Working in your workspace" while a deck is
  // written. The fallback exists so nothing breaks; this keeps it unused.
  for (const name of AGENT_TOOL_NAMES) {
    assertNotEquals(phaseLabel({ kind: "acting", tools: [name] }), "Working in your workspace", name);
  }
});

Deno.test("deleting is deliberately not on offer", () => {
  // Pinned as a decision, not left as an accident: a model that misreads "clear up
  // my ACE inhibitor notes" must not be able to act on it, and there is no confirm
  // step inside a chat turn. If this ever fails, the confirm has to come first.
  for (const name of AGENT_TOOL_NAMES) {
    assertEquals(/delete|remove|destroy|wipe/i.test(name), false, name);
  }
});

Deno.test("isAgentToolName rejects anything not in the catalog", () => {
  assertEquals(isAgentToolName("add_flashcards"), true);
  assertEquals(isAgentToolName("delete_everything"), false);
  assertEquals(isAgentToolName(""), false);
});

// ── argument handling ────────────────────────────────────────────────────────

Deno.test("parseToolArgs survives whatever the model sent", () => {
  assertEquals(parseToolArgs('{"query":"ACE"}'), { query: "ACE" });
  // A truncated stream leaves invalid JSON. An empty object lets the executor
  // report a missing field, which the model can fix; throwing would kill the turn.
  assertEquals(parseToolArgs('{"query":"AC'), {});
  assertEquals(parseToolArgs(""), {});
  // An array or a bare value is not an argument object.
  assertEquals(parseToolArgs("[1,2]"), {});
  assertEquals(parseToolArgs('"hello"'), {});
  assertEquals(parseToolArgs("null"), {});
});

Deno.test("usableCards keeps complete pairs and drops half-written ones", () => {
  const cards = usableCards([
    { back: "Blocks ACE", front: "What does lisinopril do?" },
    { back: "", front: "Missing its back" },
    { back: "Missing its front", front: "   " },
    "not an object",
    null,
    { back: "  spaced  ", front: "  trimmed  " },
  ]);
  assertEquals(cards, [
    { back: "Blocks ACE", front: "What does lisinopril do?" },
    { back: "spaced", front: "trimmed" },
  ]);
});

Deno.test("usableCards removes duplicate prompts", () => {
  assertEquals(
    usableCards([
      { front: "What is a limit?", back: "A value a function approaches." },
      { front: "  WHAT   IS A LIMIT? ", back: "Duplicate." },
    ]),
    [{ front: "What is a limit?", back: "A value a function approaches." }],
  );
});

Deno.test("usableCards rejects vague, compound, and answer-equals-prompt cards", () => {
  assertEquals(
    usableCards([
      { front: "What is this?", back: "A vague card" },
      { front: "ATP", back: "ATP" },
      { front: "What is preload? What is afterload?", back: "Two facts" },
      { front: "What determines preload?", back: "Ventricular end-diastolic stretch." },
    ]),
    [{ front: "What determines preload?", back: "Ventricular end-diastolic stretch." }],
  );
});

Deno.test("usableSlides keeps structured teaching slides and drops blanks", () => {
  assertEquals(
    usableSlides([
      { title: "Limits", bullets: ["Approach, not arrival", "Check both sides"], speaker_notes: "Sketch a graph." },
      { title: "", bullets: ["No heading"] },
      { title: "Empty", bullets: [] },
    ]),
    [{ title: "Limits", bullets: ["Approach, not arrival", "Check both sides"], speakerNotes: "Sketch a graph." }],
  );
});

Deno.test("usableCards caps a runaway batch and tolerates a non-array", () => {
  const many = Array.from({ length: MAX_CARDS_PER_CALL + 40 }, (_, i) => ({ back: `b${i}`, front: `f${i}` }));
  assertEquals(usableCards(many).length, MAX_CARDS_PER_CALL);
  assertEquals(usableCards(undefined), []);
  assertEquals(usableCards({ cards: [] }), []);
});

Deno.test("clip marks a truncated note so the model knows it read part of one", () => {
  assertEquals(clip("short"), "short");
  const long = "x".repeat(MAX_NOTE_CHARS + 500);
  const clipped = clip(long);
  assertEquals(clipped.endsWith("…[truncated]"), true);
  assertEquals(clipped.length < long.length, true);
});

// ── deck matching ────────────────────────────────────────────────────────────

Deno.test("an exact deck name matches", () => {
  assertEquals(matchDeckName("Cardiology", ["Cardiology", "Renal"]), "Cardiology");
});

Deno.test("a deck inside a folder is found by its leaf name", () => {
  // THE BUG THIS PINS: the phone encodes Study folders in the deck NAME. An
  // exact-only lookup misses "Pharmacology::Cardiology" when the student says
  // "Cardiology", and a second deck of the same name appears at the top level —
  // so their cards end up split across two decks with the same label.
  assertEquals(matchDeckName("Cardiology", ["Pharmacology::Cardiology"]), "Pharmacology::Cardiology");
  assertEquals(matchDeckName("cardiology", ["Pharmacology::Cardiology"]), "Pharmacology::Cardiology");
});

Deno.test("an ambiguous leaf name is refused rather than guessed", () => {
  // Two folders each holding a "Cardiology": picking one would put the cards
  // somewhere the student did not ask for, and they would not be told.
  assertEquals(matchDeckName("Cardiology", ["Pharm::Cardiology", "Path::Cardiology"]), null);
});

Deno.test("an exact match wins over a leaf match", () => {
  assertEquals(matchDeckName("Cardiology", ["Cardiology", "Pharm::Cardiology"]), "Cardiology");
});

Deno.test("a full folder path matches exactly", () => {
  assertEquals(matchDeckName("Pharm::Cardiology", ["Pharm::Cardiology", "Cardiology"]), "Pharm::Cardiology");
});

Deno.test("an unknown or empty name means make a new deck", () => {
  assertEquals(matchDeckName("Neurology", ["Cardiology"]), null);
  assertEquals(matchDeckName("   ", ["Cardiology"]), null);
  assertEquals(matchDeckName("Cardiology", []), null);
});

Deno.test("a deck name is split into words a person would say, keeping the exact string for tools", () => {
  // The model leaked "Biochemistry::Krebs cycle" into a saved chat message on
  // device; it can only say back what it is handed.
  assertEquals(deckNameParts("Biochemistry::Krebs cycle"), {
    folder: "Biochemistry",
    full: "Biochemistry::Krebs cycle",
    name: "Krebs cycle",
  });
  assertEquals(deckNameParts("Pharm::Cardio::Beta blockers").folder, "Pharm / Cardio");
});

Deno.test("a top-level deck has no folder, and the name is left alone", () => {
  assertEquals(deckNameParts("Krebs cycle"), { folder: "", full: "Krebs cycle", name: "Krebs cycle" });
});

Deno.test("a malformed deck name still yields something sayable", () => {
  assertEquals(deckNameParts("A :: :: B").name, "B");
  assertEquals(deckNameParts("").name, "");
});

Deno.test("the deck-listing tool tells the model not to show the '::' encoding", () => {
  // Pinned wiring: the split above only helps if the instruction rides along.
  const list = AGENT_TOOLS.find((schema) => schema.function.name === "list_study_decks");
  assertEquals(list?.function.description.includes("NEVER show"), true);
});

Deno.test("the test-writing tool carries the item-writing rules", () => {
  // The rules only help if they are actually in the description the model reads.
  // This is the wiring, pinned: a refactor that drops the concatenation would
  // otherwise leave a tool that still works and writes worse questions.
  const test = SCHEMAS.find((schema) => schema.function.name === "add_practice_test");
  assertEquals(test?.function.description.includes(EXAM_ITEM_RULES_SHORT), true);
});
