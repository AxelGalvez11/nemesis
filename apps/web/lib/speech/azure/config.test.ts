// The credential boundary.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `the region is validated because it builds a hostname`.
// Every Azure endpoint is `https://{region}.something.microsoft.com`, so an unchecked region is a
// configuration string interpolated into a URL Nemesis then sends a bearer credential to. A region
// of `evil.example.com/` would send the key somewhere else entirely, and nothing else in the stack
// would notice.

import assert from "node:assert/strict";
import test from "node:test";

import { azureConfigured, azureSpeechConfig, configuredSpeechKeys } from "./config";

const GOOD = { AZURE_SPEECH_KEY: "a-key", AZURE_SPEECH_REGION: "eastus" };

test("🔴 a region that is not a region is refused before it reaches a URL", () => {
  for (const region of [
    "evil.example.com",
    "eastus/../",
    "eastus.evil.example.com",
    "east us",
    "eastus:8080",
    "user@eastus",
    "EASTUS-",
    "e",
  ]) {
    const result = azureSpeechConfig({ ...GOOD, AZURE_SPEECH_REGION: region });
    assert.equal(result.ok, false, `"${region}" was accepted as a region`);
    assert.equal(result.ok === false && result.reason, "azure-region-malformed");
  }
});

test("real region names are accepted, including the ones with digits", () => {
  for (const region of ["eastus", "eastus2", "westeurope", "japaneast", "southeastasia", "uksouth"]) {
    const result = azureSpeechConfig({ ...GOOD, AZURE_SPEECH_REGION: region });
    assert.equal(result.ok, true, `"${region}" was rejected`);
  }
});

test("🔴 a missing key and a missing region are different refusals", () => {
  // "Nobody set this up" and "somebody set half of it up" are different problems with different
  // fixes, and one message for both sends the reader to the wrong one.
  const noKey = azureSpeechConfig({ AZURE_SPEECH_REGION: "eastus" });
  assert.equal(noKey.ok === false && noKey.reason, "azure-key-missing");
  const noRegion = azureSpeechConfig({ AZURE_SPEECH_KEY: "a-key" });
  assert.equal(noRegion.ok === false && noRegion.reason, "azure-region-missing");
});

test("every endpoint is built from the validated region and nowhere else", () => {
  const result = azureSpeechConfig(GOOD);
  assert.ok(result.ok);
  if (!result.ok) return;
  for (const endpoint of [
    result.config.tokenEndpoint,
    result.config.ttsEndpoint,
    result.config.sttEndpoint,
    result.config.voicesEndpoint,
  ]) {
    const url = new URL(endpoint);
    assert.equal(url.protocol, "https:");
    assert.ok(url.hostname.endsWith(".microsoft.com") || url.hostname.endsWith(".cognitive.microsoft.com"));
    assert.ok(url.hostname.startsWith("eastus."), `${url.hostname} was not built from the region`);
  }
});

test("the region is lower-cased, because Azure's hostnames are", () => {
  const result = azureSpeechConfig({ ...GOOD, AZURE_SPEECH_REGION: "EastUS" });
  assert.ok(result.ok && result.config.region === "eastus");
});

test("🔴 the presence map carries booleans, never values", () => {
  // It is handed to `capabilities.ts`, which is imported by client code. A map of values would put
  // a key one import away from a bundle.
  const configured = configuredSpeechKeys({ ...GOOD, XAI_API_KEY: "x" });
  assert.deepEqual(configured, {
    ASSEMBLYAI_API_KEY: false,
    AZURE_SPEECH_KEY: true,
    XAI_API_KEY: true,
  });
  for (const value of Object.values(configured)) assert.equal(typeof value, "boolean");
});

test("Azure counts as configured only when BOTH halves are present", () => {
  assert.equal(azureConfigured(GOOD), true);
  assert.equal(azureConfigured({ AZURE_SPEECH_KEY: "a-key" }), false);
  assert.equal(configuredSpeechKeys({ AZURE_SPEECH_KEY: "a-key" }).AZURE_SPEECH_KEY, false);
});
