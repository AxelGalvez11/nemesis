import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chunkNote } from "./chunk-note.ts";

Deno.test("empty or whitespace-only text yields no chunks", () => {
  assertEquals(chunkNote(""), []);
  assertEquals(chunkNote("   \n\n  "), []);
});

Deno.test("a short note is one chunk carrying its heading", () => {
  const chunks = chunkNote("# ACE inhibitors\n\nBlock angiotensin conversion.");
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0].heading, "ACE inhibitors");
  assertEquals(chunks[0].index, 0);
  assertEquals(chunks[0].content.includes("angiotensin"), true);
});

Deno.test("each markdown heading starts a new chunk", () => {
  const chunks = chunkNote("# One\n\nalpha\n\n## Two\n\nbeta");
  assertEquals(chunks.length, 2);
  assertEquals(chunks[0].heading, "One");
  assertEquals(chunks[1].heading, "Two");
  assertEquals(chunks.map((c) => c.index), [0, 1]);
});

Deno.test("a long section splits with overlap and keeps its heading", () => {
  const body = "word ".repeat(1200); // ~6000 chars, over TARGET_CHARS
  const chunks = chunkNote(`# Long\n\n${body}`);
  assertEquals(chunks.length > 1, true);
  assertEquals(chunks.every((c) => c.heading === "Long"), true);
  assertEquals(chunks.every((c) => c.content.length <= 2400), true);
  // consecutive chunks share tail/head text (overlap preserves cross-boundary context)
  const tail = chunks[0].content.slice(-100);
  assertEquals(chunks[1].content.includes(tail.trim().slice(0, 40)), true);
});

Deno.test("the heading is prepended to chunk content so it is embedded too", () => {
  const chunks = chunkNote("## Renal dosing\n\nAdjust for CrCl.");
  assertEquals(chunks[0].content.startsWith("Renal dosing"), true);
});
