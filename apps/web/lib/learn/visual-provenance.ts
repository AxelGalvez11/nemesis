// WHERE a picture came from, and how far that lets it be trusted (§42).
//
// 🔴 THIS IS A LADDER, NOT A LIST, AND THE ORDER IS THE WHOLE CONTENT OF THE FILE. The owner's
// ordering, in their own words: *"source already contains the right figure → reuse source figure;
// exact scientific representation can be rendered from data → render deterministically; good
// open/public-domain reference image exists → retrieve licensed image; none of the above works →
// generate an illustrative image. The last rung should be the least trusted one for scientific
// accuracy."* `visual-route.ts` already implemented the top two. This file adds the bottom two and,
// more importantly, makes the ORDERING itself something code enforces rather than something a
// section of a document asserts.
//
// 🔴 THE FAILURE THIS PREVENTS IS THE CHEAPEST RUNG WINNING BY DEFAULT. Generation is the easiest
// route to reach for: one call, no registry, no licence bookkeeping, a picture every time. Every
// other rung needs something to exist first. So without an ordering that code applies, the rung
// that requires the least work is the rung that gets used — and it is the one that invents
// plausible-looking detail. A generated picture of a mechanism is a drawing of what a model
// expects the mechanism to look like, which is a different thing from the mechanism.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER — the same rule `visual-route.ts` holds. Nothing here names a
// field, a topic, or a discipline. A licensed diagram is trusted because its licence and its author
// are recorded, not because of what it is a picture of; a generated one is distrusted for the same
// field-agnostic reason whether it illustrates a kidney, a truss, or a contract-formation sequence.
//
// PURE. No I/O, no registry lookup, no fetch. Deciding which candidate may be shown is separable
// from finding candidates, which is what makes every rule below a test rather than a promise.

/**
 * The four rungs, most trusted first.
 *
 * 🔴 `rendered` OUTRANKS EVERY IMAGE, INCLUDING A LICENSED ONE, AND THAT IS NOT OBVIOUS. A
 * deterministic render is not a picture somebody vouched for — it is the *encoding itself*, drawn.
 * If the canonical form is right the depiction is right, and if the canonical form is wrong the
 * depiction is wrong in a way that is inspectable, because the string that produced it is stored.
 * A retrieved image is trustworthy on someone else's authority; a rendered one is trustworthy on
 * arithmetic. Only the learner's own material outranks it, and that is a pedagogy ordering rather
 * than an accuracy one — the source figure is what they will meet again in the exam.
 */
export type VisualProvenance =
  /** A figure from the learner's own material. Evidence-backed and already familiar. */
  | "source_figure"
  /** Drawn by trusted code from a canonical encoding — LaTeX, a node/edge set, a series. */
  | "rendered"
  /** Retrieved from an openly licensed repository, with its licence and author kept. */
  | "reference_image"
  /** Produced by an image model. Illustrative only. */
  | "generated_image";

/** Most trusted first. The array IS the ordering; nothing else in this file re-states it. */
export const PROVENANCE_LADDER: readonly VisualProvenance[] = [
  "source_figure",
  "rendered",
  "reference_image",
  "generated_image",
];

/** Position on the ladder. **Lower is more trusted** — the array index, deliberately. */
export function trustRank(provenance: VisualProvenance): number {
  return PROVENANCE_LADDER.indexOf(provenance);
}

/** Would `a` be preferred over `b` for the same teaching moment? */
export function moreTrustedThan(a: VisualProvenance, b: VisualProvenance): boolean {
  return trustRank(a) < trustRank(b);
}

/**
 * What lets us show somebody else's picture.
 *
 * 🔴 THE LICENCE IS PER FILE, AND "IT CAME FROM A BIG OPEN REPOSITORY" IS NOT ONE. This is the
 * owner's own warning about the broadest reservoir available: media there *is* meant to be
 * reusable, but the licence is attached to each individual file, so a registry that records the
 * repository and not the file has recorded nothing legally useful. `source` is therefore never
 * sufficient on its own — `licence` is the field this module actually reads.
 */
export interface AssetLicence {
  /** The credit line a learner is shown. Required by the BY family; see `attributionRequired`. */
  readonly attribution?: string;
  /** An SPDX-style identifier for THIS FILE. Not the repository's general policy. */
  readonly licence: string;
  /** Which repository it came from, for the registry's own bookkeeping. Never a licence. */
  readonly source: string;
  /** Where the original sits, so a credit line can point at it. */
  readonly url?: string;
}

/**
 * Licences under which Nemesis may reuse and adapt a teaching image, including commercially.
 *
 * 🔴 AN ALLOW LIST, AND IT HAS TO BE. The default for an unrecognised licence string must be
 * "no" — a deny list would let a typo, a new identifier, or an empty string through as permitted,
 * and the failure mode of guessing wrong here is a legal one that no test in this repo would catch.
 *
 * 🔴 SHARE-ALIKE IS ON THE LIST AND IS NOT A FREE PASS. `CC-BY-SA-4.0` permits reuse and adaptation;
 * what it additionally requires is that an ADAPTATION be released under the same terms. Nemesis
 * showing a figure unmodified alongside its credit line does not trigger that. The day something
 * here starts editing a retrieved figure and shipping the result, this entry is the one to revisit,
 * and it is named here so that revisit has somewhere to land.
 */
export const REUSABLE_LICENCES: readonly string[] = [
  "CC-BY-3.0",
  "CC-BY-4.0",
  "CC-BY-SA-3.0",
  "CC-BY-SA-4.0",
  "CC0-1.0",
  "public-domain",
];

/**
 * Whether a licence string names something on that list.
 *
 * 🔴 EXTRACTED SO THE RULE HAS ONE IMPLEMENTATION AND TWO CALL SITES, NOT TWO IMPLEMENTATIONS.
 * `chooseAsset` has always applied this at SHOW time; `admitSource` in `licensed-source.ts` now
 * applies the same rule at INGEST time. Written twice, the two would answer differently the first
 * time either was edited, and the ingest copy is the one whose mistakes are permanent — a refused
 * picture is a missing picture, a wrongly admitted source is a row in a corpus nobody re-checks.
 *
 * 🔴 EXACT MATCH AFTER TRIM AND CASE-FOLD. NEVER A PREFIX TEST. `reference-images.ts` names the
 * trap by hand: `startsWith("CC BY")` admits `CC BY-NC` — the licence that ends this product's
 * commercial use — and it looks correct while doing it.
 */
export function isReusableLicence(licence: string): boolean {
  const named = licence.trim().toLowerCase();
  if (!named) return false;
  return REUSABLE_LICENCES.some((allowed) => allowed.toLowerCase() === named);
}

/** Which of those legally require a credit line to be displayed. */
export function attributionRequired(licence: string): boolean {
  return /^CC-BY/i.test(licence.trim());
}

/**
 * What Nemesis must say on a picture it generated.
 *
 * 🔴 NOT A DISCLAIMER, A LABEL, AND THE DISTINCTION MATTERS. This is not lawyer-noise appended to
 * cover a risk; it is the one fact a learner needs in order to know how to read what they are
 * looking at. A retrieved histology plate and a generated impression of one look equally
 * authoritative on a screen, and only one of them is evidence.
 */
export const ILLUSTRATIVE_NOTICE = "Illustrative — not a source figure";

/** Must this picture be labelled as an illustration rather than presented as evidence? */
export function mustLabelAsIllustrative(provenance: VisualProvenance): boolean {
  return provenance === "generated_image";
}

/**
 * May a question be marked right or wrong on the strength of this picture?
 *
 * 🔴 THE LOAD-BEARING RULE OF THE FILE. An occlusion question — cover a part, ask what it is — is
 * graded against the picture, so the picture becomes the answer key. A generated image cannot be
 * an answer key: it is an image model's impression of what such a diagram usually looks like, and
 * its labels, proportions and adjacencies are whatever made a plausible picture. Marking a learner
 * WRONG against invented detail is worse than showing them nothing, because it also writes durable
 * evidence against them for a question that had no correct answer.
 */
export function mayBearAccuracyClaim(provenance: VisualProvenance): boolean {
  return provenance !== "generated_image";
}

/** A picture the registry offers for a moment, below the two rungs the router already owns. */
export interface CandidateAsset {
  /** Where the pixels are, resolved to a signed URL at render time. Never bytes — see `FigureKnowledge`. */
  readonly assetPath: string;
  readonly caption?: string;
  /** Absent on `generated_image` and `source_figure`, required on `reference_image`. */
  readonly licence?: AssetLicence;
  /**
   * 🔴 `source_figure` WAS MISSING HERE, AND THAT IS WHY THE TOP OF THE LADDER WAS UNREACHABLE.
   * `PROVENANCE_LADDER` has put the learner's own material first since it was written — "evidence-
   * backed and already familiar" — but a candidate could only ever be a retrieved or a generated
   * image, so a `figure` request could not offer the learner's own lecture even when it held
   * exactly the picture asked for. The ladder said the right thing and nothing could climb it.
   */
  readonly provenance: Extract<VisualProvenance, "generated_image" | "reference_image" | "source_figure">;
}

/**
 * Why no candidate may be shown.
 *
 * 🔴 EACH ONE IS SOMETHING DIFFERENT WENT WRONG, the same discipline `VisualRefusal` holds. "the
 * registry was empty" and "the registry held a figure whose licence nobody recorded" are a coverage
 * problem and a BOOKKEEPING problem, and a system that reports both as "no picture" can never
 * notice the second is happening — which is precisely how an unlicensed image ends up on screen.
 */
export type AssetRefusal =
  /** Nothing was offered at all. */
  | "no-candidates"
  /** A reference image whose licence requires a credit line and carries none. */
  | "attribution-missing"
  /** A candidate with no stored pixels. Same fact as `figure-has-no-asset`, one rung down. */
  | "asset-has-no-path"
  /**
   * The only usable candidate was generated, and the learner is being graded against the picture.
   *
   * 🔴 ITS OWN REASON, BECAUSE IT IS THE ONE WORTH COUNTING. It means the registry has a hole
   * exactly where a teaching interaction wanted a trustworthy picture, and generation quietly
   * filling that hole is the failure this whole module exists to make impossible.
   */
  | "generated-cannot-bear-accuracy"
  /** A retrieved image with no licence recorded. "From a big open repository" is not a licence. */
  | "licence-missing"
  /** A licence was recorded and is not one Nemesis may reuse under. */
  | "licence-not-reusable";

export type AssetChoice =
  | { asset: CandidateAsset; ok: true }
  | { detail: string; ok: false; reason: AssetRefusal };

export interface AssetChoiceInput {
  /**
   * Will the learner be marked right or wrong against this picture?
   *
   * True for a question asked OF the image — locating a part, naming what is covered. False when
   * the picture accompanies an explanation and nothing is graded on it.
   */
  readonly accuracyBearing: boolean;
  readonly candidates: readonly CandidateAsset[];
}

/**
 * The most trusted candidate that may actually be shown, or a named reason there is none.
 *
 * 🔴 REFUSING IS THE COMMON AND CORRECT OUTCOME, exactly as `prose` is for the router above. A
 * registry with nothing for this concept is not a failure to be papered over with a generated
 * picture; it is the true answer that no trustworthy image of this exists yet.
 */
export function chooseAsset(input: AssetChoiceInput): AssetChoice {
  if (input.candidates.length === 0) {
    return { detail: "the registry offered nothing for this moment", ok: false, reason: "no-candidates" };
  }

  // 🔴 SORTED BY TRUST BEFORE ANYTHING IS CHECKED, so the first refusal reported is the one that
  // cost us the BEST candidate. Checking in arrival order would report whatever the registry
  // happened to list first, and a report saying "generated image rejected" while an unlicensed
  // reference image sat behind it in the queue would point at the wrong problem entirely.
  const ordered = [...input.candidates].sort(
    (a, b) => trustRank(a.provenance) - trustRank(b.provenance),
  );

  let firstRefusal: AssetChoice | null = null;
  const remember = (refusal: AssetChoice) => {
    if (!firstRefusal) firstRefusal = refusal;
  };

  for (const candidate of ordered) {
    if (!candidate.assetPath.trim()) {
      remember({
        detail: "a candidate names no stored asset, so there are no pixels to show",
        ok: false,
        reason: "asset-has-no-path",
      });
      continue;
    }

    if (candidate.provenance === "generated_image") {
      // 🔴 THE ACCURACY GATE, AND IT IS ABSOLUTE RATHER THAN A PREFERENCE. There is no threshold,
      // no confidence score, and no "unless the model was sure" branch here on purpose: an image
      // model's confidence is about how plausible the picture is, which is the property that makes
      // this rung dangerous in the first place.
      if (input.accuracyBearing) {
        remember({
          detail: "the learner would be graded against a picture an image model invented",
          ok: false,
          reason: "generated-cannot-bear-accuracy",
        });
        continue;
      }
      return { asset: candidate, ok: true };
    }

    // 🔴 THE LEARNER'S OWN LECTURE NEEDS NO LICENCE, AND THAT IS NOT A HOLE IN THE GATE. Every
    // rule below is about REUSING SOMEBODY ELSE'S picture — may we show it, and who must be
    // credited. A `source_figure` is a page out of a file this learner uploaded, shown back to
    // them and to nobody else: the asset lives under their own id in owner-scoped storage, and RLS
    // means no other account can fetch it. There is no redistribution to license.
    //
    // 🔴 IT SITS ABOVE THE LICENCE CHECKS, NOT AS AN EXCEPTION INSIDE THEM, so no future edit to
    // the reuse rules can accidentally start demanding a credit line for a student's own slide.
    if (candidate.provenance === "source_figure") return { asset: candidate, ok: true };

    const licence = candidate.licence;
    if (!licence || !licence.licence.trim()) {
      remember({
        detail: `no licence recorded for "${candidate.assetPath}" — a repository name is not a licence`,
        ok: false,
        reason: "licence-missing",
      });
      continue;
    }

    if (!isReusableLicence(licence.licence)) {
      remember({
        detail: `"${licence.licence}" is not a licence Nemesis may reuse a teaching image under`,
        ok: false,
        reason: "licence-not-reusable",
      });
      continue;
    }

    if (attributionRequired(licence.licence) && !licence.attribution?.trim()) {
      remember({
        detail: `${licence.licence} requires a credit line and none was kept for "${candidate.assetPath}"`,
        ok: false,
        reason: "attribution-missing",
      });
      continue;
    }

    return { asset: candidate, ok: true };
  }

  // Unreachable only because the empty case returned above; kept total rather than asserted.
  return firstRefusal ?? { detail: "no candidate survived", ok: false, reason: "no-candidates" };
}

/**
 * The credit line to display beside a shown asset, or null when none is owed.
 *
 * 🔴 THE CREDIT IS PART OF SHOWING THE PICTURE, NOT A PROPERTY OF THE REGISTRY ROW. A licence kept
 * in a database and never rendered is a record of a promise nobody kept. `chooseAsset` refuses a
 * BY-licensed image with no attribution precisely so that this function always has something to
 * return when one is owed.
 */
export function creditLineFor(asset: CandidateAsset): string | null {
  if (asset.provenance === "generated_image") return ILLUSTRATIVE_NOTICE;
  const licence = asset.licence;
  if (!licence) return null;
  const credit = licence.attribution?.trim();
  const parts = [credit || licence.source.trim(), licence.licence.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
