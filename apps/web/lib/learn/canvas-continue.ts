// The one button (contract §38).
//
// > **"The only button should be 'continue' below reading passages, thats it."**
// > **"Anytime there is a reading requirement, there should be a continue button. Whether it be a
// > passage or a correction explanation."**
//
// Everything else on the learning surface either steers (the composer), moves (navigation) or
// belongs to dictation. Nothing chooses the next cognitive action — that is §27's ban on mode
// selection expressed as a UI rule, and §26's *"do not make the learner manage the learning
// system."* "Retest me" and "Fix my weak spots" are deleted under exactly that rule: both
// behaviours are owed to the learner automatically, by §18 and by objective ordering.
//
// ── 🔴 THE TRIGGER IS A READING REQUIREMENT, NOT A COMPONENT TYPE ────────────────────────────
//
//     WRONG   hard-code Continue into <ReadingPassage> and <Correction>
//     RIGHT   "requires reading" is a PROPERTY of a region; Continue FOLLOWS from it
//
// The difference is not stylistic. Written as an enumeration of components, every future surface
// that asks the learner to read something needs somebody to remember to add a button, and the
// first one nobody remembers is a screen the learner cannot leave. Written as a property, a new
// surface declares what it is and the control appears — and a surface that asks for production
// rather than reading does NOT get one, which falls out rather than being enforced by discipline.
//
// It also dissolves the §19 / invariant-5 problem instead of special-casing it. A correction is
// material the learner was asked to read, so it carries a reading requirement, so it gets a
// Continue, so nothing advances before it has been read. No exception clause anywhere.
//
// ── 🔴 WHY THE ANSWER IS ONE REGION AND NOT A LIST ───────────────────────────────────────────
//
// `composeSurface` explicitly allows reading material and a hosted task to be on screen at once —
// *"reading material may ALWAYS coexist with a hosted task"*. So two regions can carry a reading
// requirement simultaneously: an unread passage, and a correction sitting above it. If each
// rendered its own control the learner would see **two buttons saying the same word in one
// viewport**, directly against the sentence this module is named after.
//
// So the question is asked once and answered with at most one region. §29 is what makes that
// correct rather than arbitrary: *"the current cognitive task owns attention."*
//
// 🔴 AND THE LABEL IS A CONSTANT. Three equal string literals is exactly how `ACCEPTED_MATERIAL`
// drifted across the three upload doors — they were equal once, too. One word, one meaning, one
// definition.

// ── 🔴 §39: THE PROPERTY IS COGNITIVE MODE, AND THE POLICY DECLARES IT ───────────────────────
//
// > "The Canvas advances automatically after production and brief answer exposure. It waits for
// > explicit acknowledgement only when Nemesis has presented material that requires deliberate
// > reading or inspection. **Correctness does not determine advancement; cognitive mode does.**"
//
// This cuts both ways, which is what makes it the right rule: a CORRECT answer that reveals an
// explanation worth reading GETS a Continue, and an INCORRECT one needing only a word revealed
// does not.
//
//     transient    Valsartan → Losartan        auto-advance, ~1-2s, then the next retrieval
//     deliberate   a paragraph replacing a     Continue — "I have finished inspecting this"
//                  mental model, worked maths
//
// 🔴 AND IT IS NOT MINE TO INFER. Whether a correction needs deliberate reading depends on the
// knowledge type and on what kind of object is being emitted — only the policy knows, because it
// chose the action. Inferring it here from the verdict, the component type, or the LENGTH of the
// text would look right for weeks and then mis-fire on a long association or a short
// misconception. So the policy declares; this module renders the consequence.
export type CognitiveMode = "transient" | "deliberate";

/**
 * What a declared mode means for the control.
 *
 * 🔴 `null` IS A DEFECT, NOT A DEFAULT, AND THE DISTINCTION IS THE POINT. The property does not
 * exist yet — Runtime is dispatched to emit it — so today every policy decision arrives without
 * one. This resolves the unknown case to `requiresReading: true` and says so out loud, for a
 * reason that is asymmetric rather than arbitrary:
 *
 *     wrongly deliberate   the learner presses one extra button
 *     wrongly transient    the Canvas advances past material they were meant to read,
 *                          which is §34 invariant 5 broken silently
 *
 * The `unknown` flag travels with the answer so a caller can never quietly treat "we were not
 * told" as "we were told transient", and so the guard can assert that this is a stopgap with a
 * named owner rather than the design.
 */
export function readingRequirementOf(mode: CognitiveMode | null): {
  readonly requiresReading: boolean;
  readonly unknown: boolean;
} {
  if (mode === null) return { requiresReading: true, unknown: true };
  return { requiresReading: mode === "deliberate", unknown: false };
}

/** Where a region paints, so whoever owns that area can render the control in the right place. */
export type RegionPlacement = "document" | "policy";

/**
 * A region of the Canvas, reduced to the only thing this decision needs.
 *
 * 🔴 `requiresReading` IS THE WHOLE INTERFACE. It is a claim about what the region asks of the
 * learner — "I have put material in front of you and you need to process it" — and NOT about what
 * kind of component it is. A retrieval prompt is text on screen and requires no reading in this
 * sense: it asks for production, and N3 forbids offering any way past it.
 */
export interface CanvasRegion {
  readonly id: string;
  readonly requiresReading: boolean;
  readonly placement: RegionPlacement;
}

/** One word, everywhere it appears. */
export const CONTINUE_LABEL = "Continue";

/**
 * Which region, if any, owns the Continue button right now.
 *
 * Returns the region rather than a boolean so the caller cannot render the control in the wrong
 * place, and so the guard can assert the DERIVATION — a region that requires reading and gets no
 * control is the defect §38 exists to prevent.
 */
export function continueOwner(
  regions: readonly CanvasRegion[],
  gates: {
    /**
     * A retrieval prompt is up and unanswered.
     *
     * 🔴 THE PRODUCTION GUARD (N3), AND IT OUTRANKS EVERY REGION. A control that moves the learner
     * on while a demonstration is owed is a way to press past the question — not a tidiness problem
     * but the difference between producing an answer and skipping one. Checked first so no later
     * branch can reintroduce it.
     */
    readonly awaitingDemonstration: boolean;
    /** Something is being generated; pressing on now would race it. */
    readonly busy: boolean;
  },
): CanvasRegion | null {
  if (gates.awaitingDemonstration) return null;
  if (gates.busy) return null;

  const owed = regions.filter((region) => region.requiresReading);
  if (owed.length === 0) return null;

  // 🔴 THE POLICY'S REGION WINS WHEN BOTH ARE OWED, AND THE ORDER IS THE RULE. A correction is
  // what Nemesis has just put in front of the learner; a passage below it is material they were
  // already working through. If the passage won, someone who had just been corrected would be
  // offered a way past the reading instead of past the correction they were meant to absorb —
  // §34 invariant 5 broken by a button rather than by a policy.
  return owed.find((region) => region.placement === "policy") ?? owed[0] ?? null;
}

/** Does this placement render the control right now? The form a component actually needs. */
export function continueBelongsTo(owner: CanvasRegion | null, placement: RegionPlacement): boolean {
  return owner?.placement === placement;
}

/**
 * Read the cognitive mode the policy declared for what it is currently presenting.
 *
 * 🔴 A STRUCTURAL READ, NOT A TYPE CHANGE IN RUNTIME'S FILE. The property is Runtime's to emit and
 * Runtime's to name on their own decision type; this reads it without reaching across the lane
 * boundary to add a field. When it lands, this function starts returning a mode and nothing else
 * here changes — which is the point of building against the property now rather than waiting.
 *
 * Returns `null` when the policy has said nothing, which `readingRequirementOf` treats as a defect
 * with a safe resolution rather than as "transient".
 */
export function declaredCognitiveMode(decision: unknown): CognitiveMode | null {
  if (typeof decision !== "object" || decision === null) return null;
  const mode = (decision as { cognitiveMode?: unknown }).cognitiveMode;
  return mode === "transient" || mode === "deliberate" ? mode : null;
}
