/**
 * An annotation says what it is, counts honestly, and never draws itself when there is nothing.
 *
 * 🔴 THE DOOR TEST AT THE FOOT IS THE ONE THAT MATTERS. This repository's most expensive recurring
 * defect is a finished feature nobody can reach: the crop has been travelling to the conversation
 * since the annotate layer shipped and nothing ever showed it. Capability and door, asserted
 * together — the same pattern `pronunciation-door.test.ts` exists for.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { annotationLabel, hasAnnotations } from "./annotation-note";

test("🔴 the singular is read, not printed", () => {
  // "1 annotations" is the tell of a count nobody looked at, directly above the learner's sentence.
  assert.equal(annotationLabel(1), "1 annotation");
  assert.equal(annotationLabel(0), "0 annotations");
  assert.equal(annotationLabel(2), "2 annotations");
});

test("a turn that marked nothing draws nothing", () => {
  for (const empty of [null, undefined, []]) assert.equal(hasAnnotations(empty), false);
  assert.equal(hasAnnotations([{ thumbnail: null, where: null }]), true);
});

test("🔴 an annotation with no picture is still an annotation", () => {
  // The thumbnail is an object URL and dies with the document, so a reopened conversation has the
  // count and not the picture. The chip must survive that; a broken image must not appear.
  assert.equal(hasAnnotations([{ thumbnail: null, where: "Page 3" }]), true);
  const view = readFileSync(new URL("../../components/workspace/learn/annotation-note-view.tsx", import.meta.url), "utf8");
  assert.match(view, /notes\.filter\(\(note\) => note\.thumbnail\)/, "a missing crop would render a broken image");
});

test("🔴🔴 the reader SENDS what was marked and the conversation SHOWS it", () => {
  const reader = readFileSync(new URL("../../components/workspace/reader/document-reader.tsx", import.meta.url), "utf8");
  const canvas = readFileSync(new URL("../../components/workspace/learn/learning-canvas.tsx", import.meta.url), "utf8");
  // The crop has always been attached; what was missing is saying what it IS.
  assert.match(reader, /onSendToChat\?\.\(prompt, \[\.\.\.documentAttachment\(\)[\s\S]{0,120}\], \[\s*\{ thumbnail: crop/,
    "the reader attaches the crop but no longer says it is an annotation");
  assert.match(canvas, /<AnnotationNoteView notes=\{currentNotes\} \/>/, "the conversation has nowhere to show it");
  // 🔴 AND IT CANNOT BE STICKY. An ordinary send must clear the marks, or the crop hangs above the
  // next question as a picture about a sentence it has nothing to do with.
  assert.match(canvas, /setCurrentNotes\(\(held\) => \(fromReader\.notes\.length > 0 \? fromReader\.notes : held\.length > 0 \? \[\] : held\)\)/,
    "an ordinary send no longer clears the marks");
});

console.log("annotation-note.test.ts OK");
