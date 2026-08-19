// The seam. Callers ask for an assessment; this decides who performs it.
//
// 🔴 THIN TODAY AND THAT IS WHAT MAKES IT WORTH HAVING. One provider is integrated, so this function
// is a lookup and a call — but it is the only thing any caller imports, which means adding a second
// assessor is a branch here rather than a search through the app for the word "azure". The owner's
// constraint was explicit: *"Avoid scattering Azure-specific code throughout the app."*
//
// 🔴 SERVER ONLY. It reads `process.env` through `azureSpeechConfig`, which throws in a browser.

import {
  type PronunciationResult,
} from "@/lib/learn/pronunciation-evidence";

import { assessWithAzure, type AssessRequest } from "./azure/pronunciation";
import { configuredSpeechKeys } from "./azure/config";
import { preferredFor, type SpeechProviderId } from "./capabilities";

export interface AssessmentDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly env?: Record<string, string | undefined>;
  readonly now?: () => number;
  /** Force a provider. Ignored when it is not configured — a forced choice is a preference, not a bypass. */
  readonly prefer?: SpeechProviderId;
}

export async function assessPronunciation(
  deps: AssessmentDeps,
  request: AssessRequest,
): Promise<PronunciationResult> {
  const configured = configuredSpeechKeys(deps.env);
  const provider = preferredFor("pronunciation", configured, deps.prefer);
  if (!provider) {
    return {
      // 🔴 THE SAME NAMED GAP THIS BOUNDARY HAS ALWAYS RETURNED. A deployment without an Azure
      // credential must read as "not configured", never as a learner who scored nothing.
      detail:
        "no pronunciation-assessment provider is configured — Nemesis can hear what was said, not how",
      ok: false,
      reason: "no-provider",
    };
  }
  switch (provider.provider) {
    case "azure":
      return assessWithAzure(deps, request);
    default:
      return {
        detail: `${provider.label} is listed for pronunciation but has no implementation`,
        ok: false,
        reason: "no-provider",
      };
  }
}
