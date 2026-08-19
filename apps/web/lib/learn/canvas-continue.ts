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
 * What the policy declared, including the honest answer for a screen that asks for production.
 *
 * 🔴 `"none"` IS NOT A THIRD COGNITIVE MODE — IT IS THE ABSENCE OF AN EXPOSITION, AND IT HAD TO BE
 * SAYABLE. This module was written before the producer existed, so it had two answers and `null`,
 * and `null` means *"we were not told"*. A retrieval and a hold are neither: nothing has been put
 * in front of the learner to take in, and that is a FACT the policy knows rather than a gap in what
 * it reported. Without this value the producer would have had to pick a lie for every
 * non-exposition — `deliberate` puts a Continue on a hold screen, `transient` auto-advances a
 * question — and `null` would have gone on meaning two different things at once, which is precisely
 * what the `unknown` flag below exists to prevent.
 */
export type DeclaredMode = CognitiveMode | "none";

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
export function readingRequirementOf(mode: DeclaredMode | null): {
  readonly requiresReading: boolean;
  readonly unknown: boolean;
} {
  if (mode === null) return { requiresReading: true, unknown: true };
  // 🔴 `"none"` IS `unknown: false`. The policy answered; the answer is that nothing is being read.
  // Folding it in with `null` would put the stopgap's Continue back on a retrieval and a hold, and
  // would make the flag report a defect on the one path that reported correctly.
  return { requiresReading: mode === "deliberate", unknown: false };
}

/**
 * Where a region paints, so whoever owns that area can render the control in the right place.
 *
 * 🔴 `"reply"` IS THE CONVERSATIONAL ANSWER, AND ADDING IT IS WHAT KEEPS §38 TRUE UNDER THE
 * VANISHING CANVAS (owner, 2026-08-19). A reply that is genuinely material — *"ACE also breaks
 * down bradykinin, so blocking ACE raises it, which is what causes the cough"* — is exactly what
 * this module's trigger describes: material the learner was asked to read. It therefore has to be
 * able to own the button.
 *
 * 🔴 AND IT HAD TO ENTER THROUGH HERE RATHER THAN RENDERING ITS OWN. That is the whole argument
 * at the top of this file, arriving in practice: a reply can sit over an unread passage, and a
 * reply can sit over a correction. If it printed its own control there would be two buttons saying
 * "Continue" in one viewport — the exact thing `continueOwner` returning ONE region prevents.
 */
export type RegionPlacement = "document" | "policy" | "reply";

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
  // Nothing is offered while work is in flight, whatever the region: pressing on now would race
  // whatever is being generated. This one applies to every placement including `reply`.
  if (gates.busy) return null;

  const owed = regions.filter((region) => region.requiresReading);
  if (owed.length === 0) return null;

  // 🔴🔴 THE CONVERSATIONAL REPLY IS EXEMPT FROM THE PRODUCTION GUARD, AND THE REASON IS THAT ITS
  // BUTTON DOES NOT ADVANCE ANYTHING.
  //
  // N3 forbids a control that lets the learner press PAST an unanswered question. Every other
  // region's Continue does exactly that: it acknowledges the policy's screen and asks for the next
  // cognitive action. A reply's Continue dismisses an answer the learner themselves asked for and
  // puts back the question that is still sitting underneath it, unanswered, with the composer still
  // the only way to answer it. Suppressing it does not protect retrieval; it just strands them.
  //
  // 🔴 AND WITHOUT THIS THE OWNER'S OWN WORKED EXAMPLE IS A DEAD END. Nemesis asks "why can ACE
  // inhibitors cause cough?", the learner asks back "what does ACE normally do?", and the model
  // answers with something substantial enough to be `reading` — material, so no timer, by design.
  // With the gate applied it would also get no button: a paragraph on screen, `awaitingDemonstration`
  // still true, and no way to put it away. That is the "no screen is a dead end" invariant broken by
  // the guard that exists to protect a different screen.
  //
  // 🔴 IT IS SAFE BECAUSE THE HANDLER IS DIFFERENT, NOT BECAUSE WE PROMISE TO BE CAREFUL. The reply
  // region's `onContinue` in `learning-canvas.tsx` calls `dismissAside`; it never reaches
  // `policy.acknowledge`. There is no route from this branch to the next cognitive action.
  const reply = owed.find((region) => region.placement === "reply");
  if (reply) return reply;

  if (gates.awaitingDemonstration) return null;

  // 🔴 THE ORDER IS THE RULE: THE MOST RECENT THING NEMESIS PUT THERE WINS.
  //
  // A reply beats a correction beats a passage, and each step of that is the same argument. A
  // passage is material the learner was already working through; a correction is what Nemesis has
  // just put in front of them; a reply is what Nemesis put there in answer to something they asked
  // one second ago. Offering the button to anything older would hand the learner a way past a
  // screen they are not looking at, while the screen they ARE looking at has no exit — which is
  // §34 invariant 5 broken by a button rather than by a policy.
  //
  // 🔴 THE REPLY OUTRANKING THE POLICY IS THE INTERRUPTION CASE, WRITTEN DOWN. The learner asked a
  // question in the middle of a correction: the correction is still on screen, receded, precisely
  // so they do not lose what they were asking about. Both regions want reading. The one they
  // interrupted FOR is the one whose Continue means anything.
  // `reply` is deliberately absent: it already returned above, before the production gate. Listing
  // it here as well would be a second answer to a question that has one.
  const order: readonly RegionPlacement[] = ["policy", "document"];
  for (const placement of order) {
    const found = owed.find((region) => region.placement === placement);
    if (found) return found;
  }
  return owed[0] ?? null;
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
export function declaredCognitiveMode(decision: unknown): DeclaredMode | null {
  if (typeof decision !== "object" || decision === null) return null;
  const mode = (decision as { cognitiveMode?: unknown }).cognitiveMode;
  return mode === "transient" || mode === "deliberate" || mode === "none" ? mode : null;
}
