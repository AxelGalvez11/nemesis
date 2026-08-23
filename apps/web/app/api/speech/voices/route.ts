// The voice catalogue, filtered.
//
// 🔴 THE FULL AZURE PAYLOAD IS ABOUT 700KB AND IS NEVER SENT TO A BROWSER. A client asking "which
// voice for es-MX?" needs one answer and a handful of alternatives, not four hundred rows it will
// filter and discard. The catalogue is fetched and cached server-side and this route answers
// questions about it.
//
// 🔴 THREE QUESTIONS, ONE ENDPOINT, BECAUSE THEY ARE THE SAME QUESTION AT THREE ZOOM LEVELS: which
// languages can be spoken at all, which voices exist for one of them, and which one would be chosen.

import { fetchVoiceCatalogue } from "@/lib/speech/azure/voice-catalog";
import { selectVoice, supportedLocales } from "@/lib/speech/voice-selection";
import { json, verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

/** A hard ceiling on rows returned, so a broad query cannot become a large response. */
const MAX_ROWS = 60;

export async function GET(request: Request) {
  const user = await verifyBearer(request);
  if (!user) return json({ error: "Sign in to use speech." }, 401);

  const url = new URL(request.url);
  const locale = url.searchParams.get("locale")?.trim() ?? "";
  const gender = url.searchParams.get("gender")?.trim().toLowerCase() ?? "";
  const style = url.searchParams.get("style")?.trim() ?? "";
  const fallback = url.searchParams.get("fallback") === "true";
  const multilingual = url.searchParams.get("multilingual") === "true";

  const result = await fetchVoiceCatalogue({ fetch });
  if (!result.ok) {
    const status = result.reason.startsWith("azure-key") || result.reason.startsWith("azure-region") ? 503 : 502;
    return json({ error: "The voice catalogue is unavailable.", detail: result.detail, reason: result.reason }, status);
  }

  const catalogue = result.catalogue;

  // 🔴🔴 THE VOICES A READING PREFERENCE MAY OFFER, WHICH IS A SMALLER QUESTION THAN "WHICH VOICES
  // EXIST" (§48). Settings needs voices that can read whatever a learner works in — Nemesis is
  // field- AND language-agnostic, and a `de-DE` voice reading an English answer is worse than no
  // choice at all. Azure marks its cross-lingual voices by listing other locales they speak, so
  // `SecondaryLocaleList` is the real signal and this filters on it rather than on a name pattern.
  //
  // 🔴 DISCOVERED, NEVER HARD-CODED. The alternative was a checked-in list of Azure ids, which is
  // the exact failure `voice-catalog.ts` was written to avoid: wrong within a month, and wrong in
  // the way that 404s a learner's chosen voice. Where Azure is not configured this route already
  // answers 503 and the picker simply does not offer an Azure section.
  if (multilingual) {
    const rows = catalogue.voices
      .filter((voice) => voice.neural && !voice.preview && voice.secondaryLocales.length > 0)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, MAX_ROWS)
      .map((voice) => ({
        gender: voice.gender,
        locale: voice.locale,
        localeName: voice.localeName,
        name: voice.displayName,
        shortName: voice.shortName,
        speaks: voice.secondaryLocales.length + 1,
      }));
    return json({ fetchedAt: catalogue.fetchedAt, provider: "azure", voices: rows });
  }

  if (!locale) {
    // No locale: answer the widest question — what can be spoken at all.
    return json({
      fetchedAt: catalogue.fetchedAt,
      locales: supportedLocales(catalogue.voices),
      provider: "azure",
      totalVoices: catalogue.voices.length,
    });
  }

  const chosen = selectVoice(catalogue.voices, {
    ...(fallback ? { allowRegionFallback: true } : {}),
    ...(gender === "female" || gender === "male" || gender === "neutral" ? { gender } : {}),
    locale,
    ...(style ? { style } : {}),
  });
  if (!chosen.ok) {
    return json({ error: "No voice matches that request.", detail: chosen.detail, reason: chosen.reason }, 404);
  }

  return json({
    alternatives: chosen.choice.alternatives.slice(0, MAX_ROWS),
    because: chosen.choice.because,
    fetchedAt: catalogue.fetchedAt,
    match: chosen.choice.match,
    provider: "azure",
    requestedLocale: chosen.choice.requestedLocale,
    voice: chosen.choice.voice,
  });
}
