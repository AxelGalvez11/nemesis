import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { POINT_OF_USE_DISCLAIMER, TOS_VERSION } from "./legal";

// 🔴 THE PUBLIC LEGAL PAGES ARE PART OF WHAT NEMESIS CLAIMS TO BE. Owner, 2026-08-25: *"remove
// medical disclaimer claims, this is a general research tool not a medical tool."*
//
// /legal/disclaimer was titled "Medical Disclaimer" and was entirely about medication, supplements
// and peptides. It was the loudest thing the site still said about the product: a law student
// reading the footer of a study app and finding a page about dosing peptides learns something wrong
// about what they signed up for. `field-agnostic.test.ts` exempts `/legal/` with a comment marking
// this as an open owner decision; the decision is made, and this file is what holds it.

const page = (name: string): string =>
  readFileSync(new URL(`../app/legal/${name}/page.tsx`, import.meta.url), "utf8")
    .split("\n")
    .filter((line) => {
      const s = line.trim();
      return !(s.startsWith("//") || s.startsWith("*") || s.startsWith("/*") || s.startsWith("{/*"));
    })
    .join("\n");

test("🔴 no legal page presents Nemesis as a medical product", () => {
  // Comments are stripped, because explaining WHY the medical framing went requires naming it.
  for (const name of ["disclaimer", "terms", "privacy"]) {
    const text = page(name);
    for (const claim of ["Medical Disclaimer", "peptide", "supplement", "pharmacist", "prescription", "diagnosis", "medical device"]) {
      assert.ok(
        !new RegExp(claim, "i").test(text),
        `/legal/${name} still presents Nemesis in medical terms: "${claim}"`,
      );
    }
  }
});

test("🔴 cover was generalised, not deleted", () => {
  // Removing the medical framing is what was asked for. Removing all cover would be a different
  // decision with a real cost: a study tool that answers any question WILL be asked medical, legal,
  // financial and safety ones, and "this is not professional advice" is not a claim to be a medical
  // product. If a later edit strips these, that should be a deliberate choice and not a side effect.
  const disclaimer = page("disclaimer");
  assert.match(disclaimer, /not professional advice/i, "the disclaimer no longer disclaims anything");
  assert.match(disclaimer, /outdated, contested, misread, or wrong/i, "the citation caveat went");
  assert.match(disclaimer, /emergency/i, "the emergency line went");
  assert.match(page("terms"), /not professional advice/i, "the terms no longer disclaim anything");
});

test("🔴 medicine appears as an example, never as the subject", () => {
  // The generalist test from CLAUDE.md: would this read right to a law student AND a mechanical
  // engineering student? It does if their fields are named beside medicine rather than absent.
  const disclaimer = page("disclaimer");
  for (const field of ["clinician", "lawyer", "engineer"]) {
    assert.ok(new RegExp(field, "i").test(disclaimer), `no ${field} is named, so one field still owns the page`);
  }
  assert.match(disclaimer, /learners in any field/i);
});

test("the consent version was bumped, because the words changed", () => {
  // legal.ts's own note says to bump when the consent copy, Terms or Disclaimer change materially.
  // A user who accepted the July version accepted a medical disclaimer; we should be able to tell
  // the two acceptances apart.
  assert.notEqual(TOS_VERSION, "2026-07-12", "🔴 the disclaimer changed and the version did not");
  assert.match(TOS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!/medical/i.test(POINT_OF_USE_DISCLAIMER));
});

test("the deploy smoke check reads what the page now says", () => {
  // It asserted the literal strings "Medical Disclaimer" and "Not medical advice", so it would have
  // failed every deploy the moment this landed, and the failure would have looked like a broken
  // page rather than a stale test.
  const smoke = readFileSync(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  assert.ok(!/Medical Disclaimer/.test(smoke), "the smoke check still expects the old title");
  assert.match(smoke, /legal\/disclaimer/, "the disclaimer page lost its smoke check entirely");
});
