import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { artifactCard } from "./artifact-card.ts";
import type { ChatOutput } from "./chat-thread.ts";

const out = (partial: Partial<ChatOutput> & Pick<ChatOutput, "kind" | "title">): ChatOutput => ({
  id: "id-1",
  ...partial,
});

Deno.test("a deck inside a folder never shows the '::' encoding to the student", () => {
  const card = artifactCard(out({ kind: "flashcards", route: "/study?section=cards", title: "Pharmacology::Cardiology" }));
  assertEquals(card.title, "Cardiology");
  // The folder is not thrown away — it becomes the destination.
  assertEquals(card.where, "Study · Pharmacology");
  assertEquals(card.kicker, "Flashcard deck");
});

Deno.test("a deck nested two folders deep reads as a path, not a mangled name", () => {
  const card = artifactCard(out({ kind: "flashcards", route: "/study?section=cards", title: "Pharm::Cardio::Beta blockers" }));
  assertEquals(card.title, "Beta blockers");
  assertEquals(card.where, "Study · Pharm · Cardio");
});

Deno.test("a top-level deck still says where it went", () => {
  const card = artifactCard(out({ kind: "flashcards", route: "/study?section=cards", title: "Krebs cycle" }));
  assertEquals(card.title, "Krebs cycle");
  assertEquals(card.where, "Study · Cards");
});

Deno.test("only DECKS get the folder split — a note may legitimately contain '::'", () => {
  const card = artifactCard(out({ kind: "other", route: "/note?id=abc", title: "Ratios :: a refresher" }));
  assertEquals(card.title, "Ratios :: a refresher");
});

Deno.test("a note reads as a note, not as 'Output'", () => {
  // Notes/slides/calendar all arrive as kind "other" (the kind union is shared
  // with web). Their route is what says which they are.
  const card = artifactCard(out({ kind: "other", route: "/note?id=abc", title: "Cell division" }));
  assertEquals(card.kicker, "Note");
  assertEquals(card.where, "Library");
  assertEquals(card.opens, true);
});

Deno.test("slides and calendar events are named too", () => {
  assertEquals(artifactCard(out({ kind: "other", route: "/slides?id=x", title: "Photosynthesis" })).kicker, "Slides");
  assertEquals(artifactCard(out({ kind: "other", route: "/calendar?date=2026-08-01", title: "Midterm" })).kicker, "Calendar event");
  assertEquals(artifactCard(out({ kind: "other", route: "/calendar?date=2026-08-01", title: "Midterm" })).where, "Calendar");
});

Deno.test("an 'other' with no known route says 'Saved' rather than inventing a category", () => {
  const card = artifactCard(out({ kind: "other", title: "Something" }));
  assertEquals(card.kicker, "Saved");
  assertEquals(card.opens, false);
});

Deno.test("tests and mind maps land on their own Study sections", () => {
  assertEquals(artifactCard(out({ kind: "test", route: "/study?section=tests", title: "Limits" })).where, "Study · Tests");
  assertEquals(artifactCard(out({ kind: "mindmap", route: "/study?section=mindmaps", title: "Respiration" })).where, "Study · Mind maps");
  assertEquals(artifactCard(out({ kind: "test", route: "/study?section=tests", title: "Limits" })).kicker, "Practice test");
});

Deno.test("a test filed into a NAMED folder says that folder, not just 'Tests'", () => {
  // A Study artifact's folder is its own column, so unlike a deck it is not in
  // the title — api/agentTools.ts puts it in the route for exactly this.
  const card = artifactCard(out({ kind: "test", route: "/study?section=tests&group=Exam%202%20prep", title: "Limits" }));
  assertEquals(card.where, "Study · Exam 2 prep");
  assertEquals(card.place, "Study");
  assertEquals(
    artifactCard(out({ kind: "mindmap", route: "/study?section=mindmaps&group=Unit%203", title: "Cells" })).where,
    "Study · Unit 3",
  );
});

Deno.test("a broken group param falls back instead of taking the card down", () => {
  // decodeURIComponent throws on a lone '%'.
  assertEquals(artifactCard(out({ kind: "test", route: "/study?section=tests&group=%E0%A4%A", title: "T" })).where, "Study · Tests");
  assertEquals(artifactCard(out({ kind: "test", route: "/study?section=tests&group=", title: "T" })).where, "Study · Tests");
});

Deno.test("a recording has no page to land on, so the card says it opens a preview", () => {
  const card = artifactCard(out({ kind: "recording", title: "Lecture 4" }));
  assertEquals(card.opens, false);
  assertEquals(card.where, "Tap to read");
});

Deno.test("'place' drops the folder so a button reads 'Open in Study', not 'Open in Study · Pharm'", () => {
  assertEquals(artifactCard(out({ kind: "flashcards", route: "/study?section=cards", title: "Pharm::Cardio" })).place, "Study");
  assertEquals(artifactCard(out({ kind: "other", route: "/note?id=a", title: "Notes" })).place, "Library");
  // Nowhere to go -> no place, so the caller falls back to a plain "Open".
  assertEquals(artifactCard(out({ kind: "recording", title: "Lecture" })).place, "");
});

Deno.test("a blank title falls back to what the thing IS, never an empty card", () => {
  assertEquals(artifactCard(out({ kind: "test", route: "/study?section=tests", title: "   " })).title, "Practice test");
});
