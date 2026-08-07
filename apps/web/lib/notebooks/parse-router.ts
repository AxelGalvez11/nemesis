/**
 * Which parser reads which format.
 *
 * 🔴 THE DEFAULT IS OUR OWN PARSER, FOR EVERY FORMAT, ALWAYS. This file adds a
 * road, not a diversion. With no environment set, `routeFor` returns "nemesis"
 * for pdf, docx, pptx and image, which is exactly what production does today and
 * what it will keep doing until someone deliberately sets the flag.
 *
 * 🔴 A HYBRID IS THE EXPECTED SHAPE, NOT A COMPROMISE. Measured over 345 real
 * course files, neither parser won everything:
 *
 *   PDF    Docling wins outright. Our PDF lane found 0 tables and 0 list items
 *          across 59 files; Docling found 33 tables (937 cells) and 224 list
 *          items, 115 of them carrying a real marker.
 *   DOCX   Split. Our numbering is BETTER — 2,497 of 2,497 list items carry a
 *          marker against Docling's 1,710 — because we read numbering.xml
 *          through both indirections. Docling is better at header rows (1,038
 *          marked header cells against our 13) and it recovers 196 figures where
 *          we recover none at all.
 *   PPTX   Ours wins on the thing that matters most for a lecture, by
 *          construction: speaker notes reached through each slide's own
 *          relationships, plus SmartArt and chart text, plus SHA-1 image dedupe.
 *
 * So the flag is PER FORMAT. A single global switch would force a format to
 * change owner just because another format did.
 */
import type { DocumentKind } from "./parse-document.ts";

export type ParserChoice = "nemesis" | "docling";

/**
 * Formats the experimental lane may own, read from the environment.
 *
 * `DOCLING_FORMATS="pdf"` routes only PDFs. An unrecognised entry is ignored
 * rather than throwing: a typo in an environment variable must not take document
 * reading offline.
 */
export function doclingFormats(env: NodeJS.ProcessEnv = process.env): ReadonlySet<DocumentKind> {
  const raw = (env.DOCLING_FORMATS ?? "").trim().toLowerCase();
  if (!raw) return new Set();
  const allowed: DocumentKind[] = ["pdf", "docx", "pptx"];
  const chosen = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is DocumentKind => (allowed as string[]).includes(s));
  return new Set(chosen);
}

export interface RouteDecision {
  parser: ParserChoice;
  /** Why, in words, for the parse record. Never invented at the call site. */
  reason: string;
}

/**
 * Choose a parser.
 *
 * `serviceConfigured` is passed in rather than read here so this stays a pure
 * function: the routing rule is the thing worth testing, and it should not
 * require an HTTP client to test it.
 */
export function routeFor(
  kind: DocumentKind,
  options: { formats: ReadonlySet<DocumentKind>; serviceConfigured: boolean },
): RouteDecision {
  if (!options.formats.has(kind)) {
    return { parser: "nemesis", reason: "docling not enabled for this format" };
  }
  if (!options.serviceConfigured) {
    // Enabling the format without configuring the service is a misconfiguration,
    // and the safe reading of a misconfiguration is "carry on as before".
    return { parser: "nemesis", reason: "docling enabled but no service configured" };
  }
  return { parser: "docling", reason: "docling enabled for this format" };
}

/**
 * What to do when the experimental lane fails.
 *
 * 🔴 ALWAYS FALL BACK, AND ALWAYS SAY SO. A document the student uploaded must
 * be read by something. The fallback is not a silent retry: the reason travels
 * with the result so a parse that came from the second choice is never recorded
 * as though it came from the first.
 */
export function fallbackReason(reason: string): string {
  return `docling unavailable (${reason}); read with the built-in parser`;
}
