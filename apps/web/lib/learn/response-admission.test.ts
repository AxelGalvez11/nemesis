import assert from "node:assert/strict";
import { test } from "node:test";

import { isAdmissionOfNotKnowing } from "./response-admission";

test("🔴 an admission is NOT sent to the judge, because it is not a wrong answer", () => {
  // The control that used to say this was removed from the recall surface. If a typed admission
  // reached the evaluator it would come back `incorrect`, and "we still do not know" would be
  // stored as "they got it wrong" — absence of evidence recorded as negative evidence.
  for (const said of [
    "I don't know",
    "i dont know",
    "I don’t know this one",
    "idk",
    "IDK...",
    "no idea",
    "No clue!",
    "not sure",
    "dunno",
    "skip",
    "pass",
    "I can't remember",
    "I have no idea, sorry",
    "unsure",
  ]) {
    assert.equal(isAdmissionOfNotKnowing(said), true, `"${said}" should count as no attempt`);
  }
});

test("🔴 a HEDGED attempt is still an attempt", () => {
  // "Not sure, maybe Diovan?" contains an admission phrase and a real answer. Treating it as no
  // attempt would throw away a demonstration the learner actually gave — and hedging is precisely
  // the thing the evaluator should read, rather than a string matcher.
  for (const said of [
    "not sure, maybe Diovan?",
    "I don't know... Cozaar?",
    "idk but I think valsartan",
    "no idea, possibly losartan",
  ]) {
    assert.equal(isAdmissionOfNotKnowing(said), false, `"${said}" contains a real attempt`);
  }
});

test("a real answer is never mistaken for an admission", () => {
  for (const said of ["Cozaar", "valsartan", "Diovan", "It's the brand name Cozaar"]) {
    assert.equal(isAdmissionOfNotKnowing(said), false, said);
  }
});

test("an empty response is not an admission — nothing was said at all", () => {
  // Submitting nothing is already refused upstream; it must not silently become a recorded event.
  for (const said of ["", "   ", "..."]) assert.equal(isAdmissionOfNotKnowing(said), false);
});

test("the matcher carries no subject-matter vocabulary", async () => {
  // Every phrase has to read identically for a law student and a machinist. A field-specific word
  // here would be the keyword-list mistake this codebase keeps refusing.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./response-admission.ts", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("const ADMISSIONS"), source.indexOf("export function"));
  for (const domain of ["drug", "brand", "generic", "dose", "patient", "case", "statute", "torque"]) {
    assert.equal(body.includes(domain), false, `"${domain}" is subject matter, not a learner state`);
  }
});
