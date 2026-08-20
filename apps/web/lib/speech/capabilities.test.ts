// Who serves which speech capability, and what is honestly true of this deployment.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a provider with no credential is never reported as serving`.
// This repo has already shipped a table that described intent and read as description — §41's
// eleven knowledge kinds against one lane. A capability registry is the same trap wearing different
// clothes: "Azure serves pronunciation" is a lie in every environment that has no Azure key, and the
// place it does damage is a surface that offers a learner a feature that cannot run.

import assert from "node:assert/strict";
import test from "node:test";

import { capabilityReport, preferredFor, PROVIDER_ROWS, providersFor } from "./capabilities";

const ALL = { ASSEMBLYAI_API_KEY: true, AZURE_SPEECH_KEY: true, XAI_API_KEY: true };
const NONE = { ASSEMBLYAI_API_KEY: false, AZURE_SPEECH_KEY: false, XAI_API_KEY: false };

test("🔴 a provider with no credential is never reported as serving", () => {
  const report = capabilityReport(NONE);
  for (const row of report) {
    if (row.keyEnv === null) continue;
    assert.equal(row.status, "unconfigured", `${row.provider}/${row.capability} claimed to work with no key`);
  }
});

test("🔴 no row in this table names a secret's VALUE, only its name", () => {
  // This module is imported by client code. A map of values would put a key one import away from a
  // bundle.
  for (const row of PROVIDER_ROWS) {
    assert.ok(row.keyEnv === null || /^[A-Z0-9_]+$/.test(row.keyEnv), `${row.keyEnv} is not an env var name`);
  }
});

test("the browser serves transcription with no credential at all", () => {
  const report = capabilityReport(NONE);
  const browser = report.find((row) => row.provider === "browser");
  assert.equal(browser?.status, "serving");
  assert.equal(browser?.capability, "transcription");
});

test("🔴 the Canvas lane stays on xAI and Azure takes the language lane", () => {
  // Two providers, two jobs. Azure did not arrive as a migration.
  assert.equal(preferredFor("tts", ALL)?.provider, "xai");
  assert.equal(preferredFor("tts", ALL, "azure")?.provider, "azure");
  assert.equal(preferredFor("pronunciation", ALL)?.provider, "azure");
});

test("🔴 the language lane degrades to xAI rather than to silence", () => {
  // Worse audio is still a lesson; no audio is a broken feature.
  const withoutAzure = { ...ALL, AZURE_SPEECH_KEY: false };
  assert.equal(preferredFor("tts", withoutAzure, "azure")?.provider, "xai");
  // Pronunciation has no fallback, and says so rather than pretending.
  assert.equal(preferredFor("pronunciation", withoutAzure), null);
});

test("a capability nobody can serve reports rows rather than emptiness", () => {
  // "Nobody can do this" and "nothing is wired for this" are different problems with different
  // fixes, and an empty list cannot tell them apart.
  const report = capabilityReport(NONE).filter((row) => row.capability === "pronunciation");
  assert.ok(report.length > 0);
  assert.ok(report.every((row) => row.status === "unconfigured"));
});

test("every capability has at least one provider listed", () => {
  for (const capability of ["tts", "pronunciation", "transcription"] as const) {
    assert.ok(providersFor(capability).length > 0, `${capability} has no provider`);
  }
});

test("a forced provider that is not configured is ignored rather than obeyed", () => {
  // A preference is not a bypass: forcing an unconfigured provider must not produce a row that
  // cannot run.
  assert.equal(preferredFor("transcription", NONE, "assemblyai")?.provider, "browser");
});
