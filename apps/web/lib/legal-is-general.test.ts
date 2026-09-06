import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DISCLAIMER_SECTION_IDS, LEGAL_VERSION, PRIVACY, SUBPROCESSORS, TERMS, type LegalDocument } from "@nemesis/shared";

import { needsReconsent, POINT_OF_USE_DISCLAIMER, TOS_VERSION } from "./legal";

// 🔴 THE PUBLIC LEGAL PAGES ARE PART OF WHAT NEMESIS CLAIMS TO BE. Owner, 2026-08-25: *"remove
// medical disclaimer claims, this is a general research tool not a medical tool."*
//
// /legal/disclaimer was titled "Medical Disclaimer" and was entirely about medication, supplements
// and peptides. It was the loudest thing the site still said about the product. `field-agnostic.test.ts`
// scans the page files; since 2026-09-05 the words live in packages/shared/src/legal and both the app
// and the landing site render them, so this reads the shared data rather than the page source.

const text = (doc: LegalDocument): string =>
  [doc.title, doc.lead, ...doc.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? [])])].join("\n");

const disclaimer = (): string =>
  TERMS.sections
    .filter((s) => (DISCLAIMER_SECTION_IDS as readonly string[]).includes(s.id ?? ""))
    .flatMap((s) => [s.heading, ...s.paragraphs])
    .join("\n");

test("🔴 no legal document presents Nemesis as a medical product", () => {
  for (const [name, doc] of [["terms", TERMS], ["privacy", PRIVACY]] as const) {
    for (const claim of ["Medical Disclaimer", "peptide", "supplement", "pharmacist", "prescription", "diagnosis", "medical device"]) {
      assert.ok(!new RegExp(claim, "i").test(text(doc)), `${name} still presents Nemesis in medical terms: "${claim}"`);
    }
  }
});

test("🔴 cover was generalised, not deleted", () => {
  // Removing the medical framing is what was asked for. Removing all cover would be a different
  // decision with a real cost: a study tool that answers any question WILL be asked medical, legal,
  // financial and safety ones, and "this is not professional advice" is not a claim to be a medical
  // product. If a later edit strips these, that should be a deliberate choice and not a side effect.
  const d = disclaimer();
  assert.match(d, /not professional advice/i, "the disclaimer no longer disclaims anything");
  assert.match(d, /outdated, contested, misread, or wrong/i, "the citation caveat went");
  assert.match(d, /emergency/i, "the emergency line went");
  assert.match(text(TERMS), /not professional advice/i, "the terms no longer disclaim anything");
  assert.match(text(PRIVACY), /not professional advice/i, "the privacy policy no longer disclaims anything");
});

test("🔴 medicine appears as an example, never as the subject", () => {
  // The generalist test from CLAUDE.md: would this read right to a law student AND a mechanical
  // engineering student? It does if their fields are named beside medicine rather than absent.
  const d = disclaimer();
  for (const field of ["clinician", "lawyer", "engineer"]) {
    assert.ok(new RegExp(field, "i").test(d), `no ${field} is named, so one field still owns the page`);
  }
  assert.match(d, /learners in any field/i);
});

test("plain English: no em dashes and no dead plan names", () => {
  for (const doc of [TERMS, PRIVACY]) {
    assert.ok(!/—/.test(text(doc)), `${doc.title} contains an em dash`);
    assert.ok(!/Paid Plus|Plus plan|free trial is/i.test(text(doc)), `${doc.title} names a plan that does not exist`);
  }
});

test("the terms say what billing actually is: one plan, no trial, cancel any time, refunds", () => {
  const terms = text(TERMS);
  assert.match(terms, /one plan, called Nemesis/i);
  assert.match(terms, /monthly or yearly/i);
  assert.match(terms, /no free trial/i);
  assert.match(terms, /cancel at any time from Settings/i);
  assert.match(terms, /end of the period you have already paid for/i);
  assert.match(terms, /do not refund a partial period/i);
  assert.match(terms, /charged twice, or charged after you cancelled, we refund/i);
  assert.match(terms, /support@enternemesis\.com/);
});

test("the policy names who receives content, and says nobody trains on it", () => {
  const privacy = text(PRIVACY);
  for (const name of ["DeepSeek", "Google Gemini", "Mistral", "LlamaParse", "xAI", "AssemblyAI", "Brave", "Supabase", "Stripe", "Vercel", "PostHog", "Resend", "Composio", "RevenueCat"]) {
    assert.match(privacy, new RegExp(name), `${name} is missing from the service providers section`);
  }
  assert.match(privacy, /we do not permit/i);
  assert.match(text(TERMS), /we do not permit/i);
  assert.match(text(TERMS), /You own what you upload/i);
  // Every provider in the list names where it was found in the code, so the list can be audited.
  const source = readFileSync(new URL("../../../packages/shared/src/legal/subprocessors.ts", import.meta.url), "utf8");
  for (const s of SUBPROCESSORS) {
    assert.ok(source.includes(`name: "${s.name}"`));
  }
  assert.ok((source.match(/found at /g) ?? []).length >= 15, "sub-processors are not annotated with where they were found");
});

test("the consent version is the shared version, and older accounts are asked again", () => {
  assert.equal(TOS_VERSION, LEGAL_VERSION);
  assert.equal(TOS_VERSION, "2026-09-05");
  assert.equal(TERMS.version, TOS_VERSION);
  assert.equal(PRIVACY.version, TOS_VERSION);
  assert.match(TOS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!/medical/i.test(POINT_OF_USE_DISCLAIMER));
  assert.equal(needsReconsent({ tos_version: "2026-08-25" }), true, "an account on the old version is asked");
  assert.equal(needsReconsent({}), true, "an account with no version is asked once");
  assert.equal(needsReconsent(undefined), true);
  assert.equal(needsReconsent({ tos_version: TOS_VERSION }), false);
});

test("the gate is mounted in the workspace layout and records the reconsent", () => {
  const layout = readFileSync(new URL("../app/(workspace)/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<TermsReconsentGate \/>/);
  const gate = readFileSync(new URL("../components/workspace/onboarding/terms-reconsent-gate.tsx", import.meta.url), "utf8");
  assert.match(gate, /tos_recorded_via: "reconsent"/);
  assert.match(gate, /supabase\.auth\.updateUser/);
  assert.match(gate, /We updated our Terms and Privacy Policy/);
});

test("the deploy smoke check reads what the pages now say", () => {
  const smoke = readFileSync(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  assert.ok(!/Medical Disclaimer/.test(smoke), "the smoke check still expects the old title");
  assert.match(smoke, /legal\/disclaimer/, "the disclaimer page lost its smoke check entirely");
  // smoke.mjs looks for these two headings by name; the shared data must keep them.
  assert.ok(PRIVACY.sections.some((s) => s.heading === "Service providers"));
  assert.ok(TERMS.sections.some((s) => s.heading === "Subscriptions and billing"));
});
