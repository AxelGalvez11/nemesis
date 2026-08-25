// Run: npx tsx --test packages/shared/src/plain-dashes.test.ts   (cwd = repo root)

import assert from "node:assert/strict";
import { test } from "node:test";

import { plainDashes, streamingDashes } from "./plain-dashes.ts";

test("🔴🔴🔴 the sentence the owner photographed", () => {
  // Measured on the live app, 2026-08-25, in a reply about z = sin(sqrt(x^2 + y^2)).
  assert.equal(
    plainDashes(`Here's a classic example — the "saddle with ripples" surface.`),
    `Here's a classic example, the "saddle with ripples" surface.`,
  );
});

test("🔴🔴 a pair of dashes becomes a pair of commas", () => {
  assert.equal(
    plainDashes("The axon — the long one — carries the signal."),
    "The axon, the long one, carries the signal.",
  );
});

test("🔴🔴 unspaced, spaced and double-spaced all land the same", () => {
  assert.equal(plainDashes("He tried—and failed."), "He tried, and failed.");
  assert.equal(plainDashes("He tried — and failed."), "He tried, and failed.");
  assert.equal(plainDashes("He tried  —  and failed."), "He tried, and failed.");
  // The horizontal bar looks identical on screen and is the obvious way round a ban on one glyph.
  assert.equal(plainDashes("He tried ― and failed."), "He tried, and failed.");
});

test("🔴🔴 a comma is not doubled up when the left side is already punctuated", () => {
  assert.equal(plainDashes("First, — then second."), "First, then second.");
  assert.equal(plainDashes("Three parts: — one, two, three."), "Three parts: one, two, three.");
});

test("🔴🔴 a bullet stays a bullet, and does not become a comma with nothing in front of it", () => {
  assert.equal(plainDashes("— first point\n— second point"), "- first point\n- second point");
  assert.equal(plainDashes("  — indented point"), "  - indented point");
});

test("🔴🔴 a trailing dash simply goes", () => {
  assert.equal(plainDashes("He started to say —"), "He started to say");
  assert.equal(plainDashes("line one —\nline two"), "line one\nline two");
});

test("🔴🔴🔴 A NUMERIC RANGE KEEPS ITS DASH, because there the dash means 'to'", () => {
  // 🔴 THE FAILURE THIS RULE IS SHAPED TO AVOID. "1914, 1918" is a different fact from "1914–1918",
  // and a citation reading "pp. 3, 7" points at two pages instead of five.
  for (const range of ["The war ran 1914–1918.", "See pp. 3–7.", "Ages 18–24 were sampled.", "A 20–30% fall."]) {
    assert.equal(plainDashes(range), range, `"${range}" was edited`);
  }
});

test("🔴🔴 a spaced en dash between words is the same habit in a narrower character", () => {
  // Where a model told to drop the em dash goes next.
  assert.equal(plainDashes("The axon – the long one – carries it."), "The axon, the long one, carries it.");
});

test("🔴 a dash never joins two lines into one", () => {
  // `\s` would have eaten the newline and run two sentences together.
  assert.equal(plainDashes("First line.\n\nSecond — third."), "First line.\n\nSecond, third.");
});

test("🔴 prose with no dash in it comes back byte-identical, and cheaply", () => {
  const clean = "The neuron is the basic signalling unit. Dendrites receive, the axon sends.";
  assert.equal(plainDashes(clean), clean);
  assert.equal(plainDashes(""), "");
  assert.equal(plainDashes("a-b, a‑b, a−b"), "a-b, a‑b, a−b");
});

test("🔴🔴🔴 JSON survives it, because most model output IS json", () => {
  // Neither the em dash nor a comma is a JSON delimiter, so a value can be cleaned in place without
  // the document around it noticing. Every field parsed out of a reply is covered by one call.
  const before = '{"say":"The axon — the long one — carries it.","checkFigure":"neuron"}';
  const after = plainDashes(before);
  const parsed = JSON.parse(after) as { checkFigure: string; say: string };
  assert.equal(parsed.say, "The axon, the long one, carries it.");
  assert.equal(parsed.checkFigure, "neuron");
});

test("🔴🔴🔴 a chunk boundary inside ' — ' still comes out right", () => {
  // 🔴 THE FAILURE THIS EXISTS TO AVOID: cleaning each piece alone sees a dash with no word in
  // front of it and types "the axon , the long one" onto the screen, one space too wide.
  for (const split of [
    ["The axon ", "— the long one carries it."],
    ["The axon —", " the long one carries it."],
    ["The axon", " — ", "the long one carries it."],
    ["The ax", "on ", "—", " the long", " one carries it."],
  ]) {
    const stream = streamingDashes();
    const out = split.map((piece) => stream.feed(piece)).join("") + stream.flush();
    assert.equal(out, "The axon, the long one carries it.", `split ${JSON.stringify(split)} came out wrong`);
  }
});

test("🔴🔴 the stream releases what it was holding, so no text is ever swallowed", () => {
  const stream = streamingDashes();
  // Ends mid-hold: trailing spaces are kept back, and `flush` has to give them up.
  assert.equal(stream.feed("Done.  "), "Done.");
  assert.equal(stream.flush(), "  ");
  const second = streamingDashes();
  assert.equal(second.feed("He started to say —"), "He started to say");
  assert.equal(second.flush(), "");
});

test("🔴🔴🔴 a dash arriving at the START of a chunk is not a bullet", () => {
  // 🔴 THE BUG THIS FILE CAUGHT ON ITS FIRST RUN. Cleaning each piece alone put the dash at what
  // looked like the beginning of a line, so the bullet rule fired and the screen read
  // "The axon - the long one". Nothing is cleaned in pieces any more.
  const stream = streamingDashes();
  const out = stream.feed("The axon ") + stream.feed("— the long one carries it.") + stream.flush();
  assert.equal(out, "The axon, the long one carries it.");
});

test("🔴🔴 a real bullet arriving mid-stream still becomes a bullet", () => {
  const stream = streamingDashes();
  const out = stream.feed("Three parts:\n") + stream.feed("— axon\n— dendrite") + stream.flush();
  assert.equal(out, "Three parts:\n- axon\n- dendrite");
});

test("🔴🔴 what the stream types is exactly what one call would have produced", () => {
  // The property that makes the whole design safe: streamed and whole agree, whatever the split.
  const source =
    "The axon — the long one — carries it.\n— first\n— second\nThe war ran 1914–1918, so 1914 — the start — matters.";
  for (const size of [1, 2, 3, 7, 13, 64]) {
    const stream = streamingDashes();
    let out = "";
    for (let at = 0; at < source.length; at += size) out += stream.feed(source.slice(at, at + size));
    out += stream.flush();
    assert.equal(out, plainDashes(source), `chunks of ${size} disagreed with a single call`);
  }
});

console.log("plain-dashes.test.ts OK");
