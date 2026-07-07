import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { autoDepth } from "./auto-depth.ts";

Deno.test("auto-depth: bare lookups go fast", () => {
  assertEquals(autoDepth("hi"), "fast");
  assertEquals(autoDepth("what is metformin"), "fast");
  assertEquals(autoDepth(""), "fast");
});

Deno.test("auto-depth: substantive questions go thorough (no dial to force it anymore)", () => {
  // The owner's actual terse-feeling chats — these MUST get the full register now.
  assertEquals(autoDepth("is sucralose bad for you"), "thorough");
  assertEquals(autoDepth("what is metformin used for"), "thorough");
  assertEquals(autoDepth("why do I have white flakes in my hair"), "thorough");
});

Deno.test("auto-depth: comparison questions go thorough", () => {
  assertEquals(autoDepth("metformin vs semaglutide for weight loss"), "thorough");
  assertEquals(autoDepth("compare SSRIs and SNRIs"), "thorough");
  assertEquals(autoDepth("difference between RR and OR"), "thorough");
});

Deno.test("auto-depth: depth/mechanism markers go thorough", () => {
  assertEquals(autoDepth("what are the long-term risks of PPIs"), "thorough");
  assertEquals(autoDepth("how does ozempic work"), "thorough");
});

Deno.test("auto-depth: multi-part (two questions) goes thorough", () => {
  assertEquals(autoDepth("is it safe? what is the dose?"), "thorough");
});

Deno.test("auto-depth: a long question goes thorough", () => {
  assertEquals(
    autoDepth("I am a clinician and I want to understand the best available treatment options for this particular patient population"),
    "thorough",
  );
});
