// A capability over a piece of knowledge — and the identity that makes it the SAME capability
// when a second canvas meets it.
//
// 🔴 A KNOWLEDGE OBJECT AND A LEARNING OBJECTIVE ARE NOT THE SAME RECORD, AND COLLAPSING THEM IS
// THE MISTAKE THIS FILE EXISTS TO PREVENT. `losartan ↔ Cozaar` is one thing to know and several
// things to be able to do:
//
//     given losartan, produce Cozaar
//     given Cozaar, produce losartan
//     tell losartan/Cozaar apart from valsartan/Diovan
//
// A learner routinely demonstrates one and fails another — producing the brand from the generic is
// genuinely not the same skill as the reverse. So learner state attaches to `learner × objective`,
// never to `learner × concept`: a single "knows about losartan" verdict would report mastery of a
// direction nobody was ever asked.
//
// 🔴 CANVAS REFERENCES OBJECTIVES; IT DOES NOT OWN THEM. Identity must never be derived from a
// canvas id — that guarantees a fresh objective per session, which guarantees that evidence from
// session A is invisible to session B, which is the whole failure this work exists to end.
//
// 🔴 NOR FROM WORDING, EITHER THE PROMPT'S OR THE SOURCE'S. "Recall the brand for losartan", "What
// is losartan sold as?" and "Give the brand name of losartan" are one capability phrased three
// ways; a table row and a sentence in prose can carry one fact. Wording is presentation, and
// provenance belongs to the source assertion — neither may fragment learner state.

import {
  KNOWLEDGE_IDENTITY_VERSION,
  knowledgeIdentityKey,
  normalizeForIdentity,
} from "./knowledge-identity";
import type { CausalRelation, FigureKnowledge, KnowledgeObject } from "./knowledge-types";
import type { ProcedureStep } from "./procedure-sequence";
import type { ClassContrast } from "./wide-grid-classification";

/**
 * What the learner is being asked to DO.
 *
 * 🔴 DELIBERATELY FOUR, NOT TWELVE. A full capability ontology written before a second knowledge
 * type has tested it would be eleven guesses and one fact — the same mistake as a ten-way payload
 * union. `recall` and `predict` are minted; `discriminate` and `explain` are named because identity
 * has to keep them APART (see the non-convergence tests), and naming them costs nothing while
 * inventing their parameters would cost a rewrite. Add a capability when something mints it.
 *
 * 🔴 `predict` ARRIVED WITH A KNOWLEDGE TYPE, NOT ON ITS OWN, and that is the order this rule wants.
 * It is minted for a causal edge and for nothing else, because a causal edge is the first thing in
 * the corpus a learner can be asked to REASON FORWARD THROUGH rather than to look up.
 *
 * 🔴 AND IT IS `predict` BECAUSE THAT IS THE WORD THE SPEC ALREADY USES — `openingOperation("causal")`
 * returns `predict`, and `TASK_INTENT.predict` is *"say what follows, and why"*, which is exactly the
 * question minted below. Calling it `explain` would have been this codebase's named failure of
 * mapping a wider operation vocabulary DOWN onto a narrower one: the durable evidence row carries
 * `operation`, so every causal attempt would have been filed for ever under a name the spec gives to
 * a DIFFERENT question — the backward one, *"why is this the case?"*, over the same edge. That
 * question is real, is genuinely a separate capability, and is deliberately not minted yet; keeping
 * `explain` unminted is what leaves room for it.
 */
export type ObjectiveCapability = "recall" | "discriminate" | "explain" | "predict" | "locate" | "sequence";

/**
 * A positional fallback, used ONLY when the source named no columns.
 *
 * 🔴 THIS IS THE WEAKER FORM AND SHOULD BE READ AS SUCH. `left`/`right` refer to the knowledge
 * object's own canonical ordering, never the order a document printed — but "the canonically-first
 * value" is a fact about sorting, not about what the learner is being asked to do. It exists
 * because a headerless glossary still teaches something, and refusing to make any objective for it
 * would be worse. Such objectives already live in their own identity space (their knowledge key
 * carries `unstated`), so they cannot collide with role-bearing ones.
 */
export type ObjectiveDirection = "left_to_right" | "right_to_left";

export interface ObjectiveParameters {
  /**
   * What the learner is GIVEN, and what they must PRODUCE — named as the source named them.
   *
   * 🔴 THE IDENTITY MUST DESCRIBE THE CAPABILITY, NOT A COLUMN POSITION. "Produce the brand, given
   * the generic" is a thing a person can or cannot do. "Produce the right-hand value" is a fact
   * about typesetting, and it means opposite things in a `Generic | Brand` glossary and a
   * `Brand | Generic` revision sheet. Keying on position gives those two files the SAME key for
   * OPPOSITE capabilities — evidence for one direction silently credited to the other.
   *
   * With roles, the two converge correctly: both know that Cozaar is the brand and losartan the
   * generic, so both produce `input=generic, output=brand` and `input=brand, output=generic`.
   */
  inputRole?: string;
  outputRole?: string;
  /** Only when no roles are known. Never set alongside them. */
  direction?: ObjectiveDirection;
  /**
   * WHICH PART of a diagram this objective is about (§46.6).
   *
   * 🔴 ONE OBJECTIVE PER LABEL, NOT ONE PER DIAGRAM, AND THIS FIELD IS WHAT SEPARATES THEM. A
   * cylinder diagram naming piston, glow plug and intake valve teaches three different things: a
   * learner can place the piston and still have no idea where the glow plug sits. Keying every
   * label to one objective would credit all three the moment any one was answered, which is the
   * same defect `inputRole`/`outputRole` exist to prevent one dimension over.
   *
   * Normalised, because it is identity: the same label spelled with different case in two decks is
   * the same part of the same picture.
   */
  labelKey?: string;
  /**
   * WHICH MEMBER of a class this objective is about (contract R4, discriminative).
   *
   * 🔴 ONE OBJECTIVE PER MEMBER, FOR THE SAME REASON `labelKey` EXISTS ONE DIMENSION OVER. A class
   * holding `*3/*3` and `*3/*6` is not one thing a learner either can or cannot do: they may place
   * one confidently and hesitate on the other, and keying both to a single objective would credit
   * the second the moment the first was answered.
   *
   * Normalised, because it is identity: one document's `Lisinopril` and another's `lisinopril` are
   * the same member of the same class.
   */
  memberKey?: string;
  /**
   * WHICH POSITION in a procedure this objective is about — `2` is the second step.
   *
   * 🔴 THE POSITION, NOT THE STEP'S TEXT. A document that rewords "Serve the opposing party" must
   * not orphan everything the learner has demonstrated about step one; the thing being learned is
   * what comes second, and that survives an edit to how it is phrased.
   */
  stepKey?: number;
}

export interface LearningObjective {
  /** The stable, content-derived identity. Learner evidence attaches to THIS. */
  identityKey: string;
  identityVersion: number;
  /** The knowledge this is a capability over. */
  knowledgeIdentityKey: string;
  capability: ObjectiveCapability;
  parameters: ObjectiveParameters;
  /** One line for a human reading a log or a panel. 🔴 NEVER part of identity — see the header. */
  label: string;
  /**
   * What the learner is SHOWN, and what a complete answer would be.
   *
   * 🔴 DERIVED HERE BECAUSE THE SIDES ARE DECIDED HERE, AND ANYWHERE ELSE WOULD BE A SECOND
   * IMPLEMENTATION OF THE SAME DECISION. Working out which half of a pair is the cue means
   * resolving `inputRole` against the pair's own role labels — and, when the source named no
   * columns, reproducing the canonical sort the fallback uses. A task builder that re-derived
   * that would be one edit away from disagreeing with identity, and the disagreement is silent:
   * both directions would ask the SAME question while carrying OPPOSITE keys, so "the reverse is
   * still unknown" would pass for the wrong reason — the learner was never asked the reverse.
   *
   * 🔴 PRESENTATION, NEVER IDENTITY. Two canvases may word the prompt around these however they
   * like. `objectiveIdentityBasis` does not read them.
   */
  cue: string;
  answer: string;
}

/**
 * The version of the objective identity ALGORITHM, carried inside every key.
 *
 * 🔴 SAME REASONING AS THE KNOWLEDGE KEY, AND THE STAKES ARE HIGHER HERE. Learner evidence is
 * stored against an objective key. Once that has happened, changing how the key is computed
 * orphans every row silently — the old and new keys are both just strings, and nothing can tell
 * which rules produced which. With the version inside, old rows are findable and migratable.
 */
export const OBJECTIVE_IDENTITY_VERSION = 1;

/**
 * The canonical string an objective key is computed from. Exported so a disagreement about why two
 * objectives did or did not converge can be answered by looking rather than by guessing at a hash.
 *
 * 🔴 IT INHERITS THE KNOWLEDGE KEY RATHER THAN RE-DERIVING FROM STRINGS. Hashing
 * `"losartan|Cozaar|recall"` would lose the RELATION — and identical strings can stand in
 * different relationships, which is precisely why the knowledge key carries one. Inheriting means
 * the semantic distinctions established there hold here automatically, and there is one place
 * where "is this the same thing?" is decided.
 */
export function objectiveIdentityBasis(input: {
  knowledgeIdentityKey: string;
  capability: ObjectiveCapability;
  parameters: ObjectiveParameters;
}): string {
  // Serialised in a fixed order rather than by iterating the object, so a key can never depend on
  // the order the fields happened to be written in at the call site.
  const { direction, inputRole, outputRole, labelKey, memberKey, stepKey } = input.parameters;
  const role = inputRole && outputRole ? `in=${inputRole},out=${outputRole}` : "in=-,out=-";
  // 🔴 `labelKey` IS PART OF IDENTITY, AND THE CHAIN TEST IS WHY IT IS HERE. A diagram mints one
  // objective per named part; without this the three parts of a cylinder hashed to ONE key, so
  // answering "piston" would have credited the learner with the glow plug and the intake valve too.
  // That is the same laundering `inputRole`/`outputRole` prevent one dimension over — evidence for
  // one capability silently attributed to another — and it is invisible until someone counts the
  // distinct keys, which is exactly what `figure-chain.test.ts` does.
  //
  // 🔴 APPENDED ONLY WHEN SET, AND THAT CONDITIONAL IS LOAD-BEARING. My first version always
  // appended `|label=-`, which changes the basis STRING for every association and causal objective
  // ever minted — and therefore its hash, and therefore the key every existing learner's evidence
  // is filed under. Every row in `learner_evidence` would have pointed at an objective that no
  // longer exists: not a crash, just every learner silently starting again. An identity function is
  // the one place where "harmless extra field" is never harmless.
  // 🔴 `memberKey` IS HERE FOR THE REASON `labelKey` IS, AND IT WAS CAUGHT THE SAME WAY. A class
  // mints one objective per member; without this the two genotypes under `Poor (PM)` hashed to ONE
  // key, so telling the first apart would have credited the learner with the second. Counting the
  // distinct keys is the only thing that shows it — the objectives themselves look correct.
  //
  // 🔴 AND IT IS APPENDED ONLY WHEN SET, which is what keeps it from re-keying the corpus. An
  // unconditional `|member=-` would change the basis string of every association, causal and
  // spatial objective ever minted, and every row in `learner_evidence` would point at an objective
  // that no longer exists — every learner silently starting again.
  const base = `objective|${input.knowledgeIdentityKey}|${input.capability}|${role}|dir=${direction ?? "-"}`;
  const withLabel = labelKey ? `${base}|label=${labelKey}` : base;
  const withMember = memberKey ? `${withLabel}|member=${memberKey}` : withLabel;
  // Same conditional, same reason: appended only when set, so no existing objective is re-keyed.
  return stepKey === undefined ? withMember : `${withMember}|step=${stepKey}`;
}

/** A 64-bit FNV-1a, as 16 hex characters. Synchronous and dependency-free for the same reason the
 *  knowledge key's is: an async identity function would infect every caller that merely compares. */
function fnv1a64(text: string): string {
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) hash = ((hash ^ BigInt(byte)) * PRIME) & MASK;
  return hash.toString(16).padStart(16, "0");
}

export function objectiveIdentityKey(input: {
  knowledgeIdentityKey: string;
  capability: ObjectiveCapability;
  parameters: ObjectiveParameters;
}): string {
  return `${input.capability}:v${OBJECTIVE_IDENTITY_VERSION}:${fnv1a64(objectiveIdentityBasis(input))}`;
}

/** The two structural ends of a causal edge, used as role names.
 *
 *  🔴 STRUCTURAL, NOT SUBJECT-MATTER, WHICH IS WHY THEY ARE SAFE TO HARD-CODE. A causal claim in
 *  pharmacology, in contract law and in thermodynamics all have a thing that acts and a thing that
 *  follows; these name the POSITIONS in the relation, exactly as `inputRole`/`outputRole` name the
 *  columns a glossary happened to print. Nothing here knows what any cause is made of. */
const CAUSE_ROLE = "cause";
const EFFECT_ROLE = "effect";

/**
 * What a learner can be asked to do with one causal edge.
 *
 * 🔴 ONE OBJECTIVE, FORWARD, AND THE SECOND DIRECTION IS DELIBERATELY NOT MINTED. An association
 * mints both ways because producing a brand from a generic and a generic from a brand are two
 * capabilities a learner routinely splits on, and BOTH are askable with the same one-line question.
 * A causal edge's reverse — *"why is this the case?"*, the spec's `explain` — is a genuinely
 * different and genuinely valuable capability, and it is also a different question needing different
 * expected evidence and a different judgement. Minting it here before anything asks it would create
 * a row that reports "no evidence" for ever and pulls the learner's picture down for something
 * nobody was ever asked. `objectiveIdentityKey` already keeps the two apart via `capability`, so
 * adding the reverse later cannot collide with what is written today.
 *
 * 🔴 THE ANSWER IS THE EDGE STATED, NOT A MODEL ANSWER GENERATED. `statement` is what the extractor
 * recorded the SOURCE as claiming, so the reference answer a judge is given traces back to the
 * document rather than to a second generation nobody grounded.
 */
function causalObjectives(object: KnowledgeObject, relation: CausalRelation): LearningObjective[] {
  const knowledge = object.identityKey ?? knowledgeIdentityKey(object);
  const parameters: ObjectiveParameters = { inputRole: CAUSE_ROLE, outputRole: EFFECT_ROLE };
  const cue = relation.cause.text;
  // 🔴 THE CONSEQUENCE, NOT THE WHOLE CLAIM — AND THE WHOLE CLAIM IS WHAT I SHIPPED FIRST. `answer`
  // is displayed as `cue → answer`, which reads correctly for a pair ("losartan → Cozaar") and
  // absurdly for an edge whose statement CONTAINS its own cue: the live correction printed
  // "Increasing resistance → Increasing resistance — decreases — current". The cue is the cause, so
  // the answer is everything the source said FOLLOWS from it, and nothing else.
  //
  // 🔴 THE QUALIFIER RIDES ALONG, because dropping it changes the claim rather than shortening it —
  // "decreases current" and "decreases current when voltage is held constant" are different facts,
  // and the second is the one the document made. It is also what the judge is given as the
  // reference answer, so a learner who states the bound is not marked down for exceeding it.
  const consequence = relation.negated ? `does not ${relation.relation}` : relation.relation;
  const bound = relation.qualifier ? ` (${relation.qualifier})` : "";
  return [
    {
      answer: `${consequence} ${relation.effect.text}${bound}`,
      capability: "predict",
      cue,
      identityKey: objectiveIdentityKey({ capability: "predict", knowledgeIdentityKey: knowledge, parameters }),
      identityVersion: OBJECTIVE_IDENTITY_VERSION,
      knowledgeIdentityKey: knowledge,
      // 🔴 RELATION-NEUTRAL WORDING. The label must read correctly whether the source said the cause
      // produces, raises, blocks or prevents the effect — naming one of those verbs here would print
      // "leads to" over an edge the document said INHIBITS. The specific verb is on the relation and
      // is the judge's business, not the label's.
      label: `Say what follows from ${cue}, and why`,
      parameters,
    },
  ];
}

/**
 * The objectives a knowledge object supports today.
 *
 * 🔴 BOTH DIRECTIONS, AND THAT IS THE POINT OF THE WHOLE FILE. Someone who can produce the brand
 * from the generic frequently cannot do the reverse, and a system that only ever asks one way will
 * report mastery it has never observed. Two objectives means two independent pieces of learner
 * state, which is what lets Nemesis notice the asymmetry instead of averaging it away.
 *
 * 🔴 AND ONLY WHAT IS NEEDED. No `discriminate` objective is minted: nothing consumes one yet, and
 * an objective with no task behind it is a row that reports "no evidence" for ever and drags the
 * learner's picture down for a capability nobody was asked to show.
 *
 * 🔴 EVERY TYPE THAT IS NOT HANDLED RETURNS EMPTY, AND THAT LINE WAS THE WHOLE CEILING OF THE
 * PRODUCT. Until a causal edge was given a capability, `object.type !== "association"` meant that a
 * lecture full of mechanisms, processes and conditional rules could construct knowledge all day and
 * none of it would ever reach a learner: no objective, so no task, so no evidence, so no state, so
 * nothing for the policy to decide about. "Eleven knowledge kinds in the spec, one lane in the code"
 * was measured HERE. Adding a type to the extractor without adding it to this function widens the
 * spec and changes nothing a learner experiences.
 */
/**
 * A labelled diagram, as one objective per named part (§46.6).
 *
 * 🔴 THE CUE IS THE PICTURE WITH SOMETHING COVERED, NOT A SENTENCE. `cue` here is the prompt text
 * the surface shows ALONGSIDE the occluded figure; the figure itself is carried on the knowledge
 * object, because a cue string cannot hold an image. That is why this is `locate` and not `recall`:
 * the learner is not producing a fact from a word, they are reading a position and naming what
 * belongs there, which is a different capability and must not share an identity with recall.
 *
 * 🔴 ONE OBJECTIVE PER LABEL. A learner who can place the piston may have no idea where the glow
 * plug is. Minting one objective for the whole diagram would credit every part the moment any one
 * was answered — the same laundering `inputRole`/`outputRole` prevent for associations.
 *
 * 🔴 AND THE ANSWER IS THE LABEL VERBATIM, NOT NORMALISED. Normalisation exists to make identities
 * converge; it is not how a word should be shown back to a learner, and it is what a judge receives
 * as the reference answer. `Glow Plug` printed as `glow plug` is the same lesson learned in
 * `objectivesForKnowledge` below.
 */
function spatialObjectives(object: KnowledgeObject, figure: FigureKnowledge): LearningObjective[] {
  const knowledge = object.identityKey ?? knowledgeIdentityKey(object);
  return figure.labels.map((label) => {
    const parameters: ObjectiveParameters = { labelKey: normalizeForIdentity(label.text) };
    // 🔴🔴 THE CAPTION IS USED ONLY WHERE IT DOES NOT CONTAIN THE ANSWER, AND IT USUALLY DOES. The
    // comment here already said the cue *"deliberately does not name the part — naming it would
    // print the answer"*, and the code then interpolated the whole caption. That was true while a
    // caption was the document's own short line ("Figure 2. A diode."). It stopped being true when
    // captions started coming from vision, which describes the picture by listing what is in it.
    //
    // Measured in production, this is the question a learner was actually shown:
    //
    //   In this diagram (This figure is a flowchart titled "CELLULAR ENERGY PATHWAY" … It shows
    //   "GLUCOSE" … leading to "PYRUVATE" … which leads to "ATP" …), what is the covered part?
    //
    // Every answer the diagram can ask for, printed in the question that asks for it. The learner
    // reads rather than retrieves, the judge marks it `understood`, and a demonstration goes into
    // the durable record that the learner never made.
    //
    // 🔴 DROPPED WHOLE RATHER THAN EDITED. Cutting the answer out of the sentence leaves mangled
    // prose ("It shows "" in a light blue box"), and a partial scrub is a rule that has to be right
    // about every phrasing a model might use. Whether the caption names the answer is a question
    // with one honest answer, and the fallback cue is complete on its own — the figure is on screen.
    const safeCaption = mentions(figure.caption, label.text) ? "" : figure.caption;
    return {
      answer: label.text,
      capability: "locate" as const,
      // The surface renders the figure; this is the words beside it.
      cue: safeCaption
        ? `In this diagram (${safeCaption}), what is the covered part?`
        : "What is the covered part of this diagram?",
      identityKey: objectiveIdentityKey({ capability: "locate", knowledgeIdentityKey: knowledge, parameters }),
      identityVersion: OBJECTIVE_IDENTITY_VERSION,
      knowledgeIdentityKey: knowledge,
      label: `Name the covered part of ${safeCaption || "the diagram"}`,
      parameters,
    };
  });
}

/**
 * Does this text name that answer?
 *
 * 🔴 WORD BOUNDARIES, NOT `includes`. A bare substring test would find "ATP" inside "ATPase" and
 * drop a caption that never gave the answer away, and — the direction that matters — would MISS
 * nothing, so the cost of getting it wrong is asymmetric. Case-insensitive because a caption
 * writing GLUCOSE and a label reading Glucose are the same word.
 *
 * 🔴 AND IT IS FIELD-AGNOSTIC BY CONSTRUCTION. It compares the answer against the text and knows
 * nothing about what either means, so it works the same for a circuit diagram, a bone, a legal
 * flowchart or a knitting pattern.
 */
function mentions(text: string | undefined, answer: string): boolean {
  const needle = answer.trim();
  if (!text || !needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}

/**
 * A class, as one objective per member it holds — contract R4's `discriminative` kind.
 *
 * 🔴 THE SIBLINGS ARE IN THE QUESTION, WHICH IS WHAT STOPS THIS BEING A RECALL OBJECTIVE WEARING A
 * NEW NAME. "Which group is X in?" is answerable by looking one fact up, and would file every
 * attempt under `discriminate` while observing nothing a `recall` objective does not already
 * observe. Naming the neighbour it must be told APART FROM is what makes the answer capable of
 * being wrong in the interesting way — the learner who has memorised the label but cannot say what
 * separates it from the class next door.
 *
 * 🔴 AND THE ANSWER IS THE CLASS, NOT THE DISTINGUISHING FEATURE, because the grid did not state
 * one. The feature lives spread across `featureColumns` and naming it would be inference. So the
 * checkable part is the label the source printed, and the "what tells you" is what the judge reads
 * for depth — the same division `predict` makes between the effect and the "and why".
 */
function classificationObjectives(object: KnowledgeObject, contrast: ClassContrast): LearningObjective[] {
  const knowledge = object.identityKey ?? knowledgeIdentityKey(object);
  const axis = contrast.axis?.trim();
  return contrast.members.map((member) => {
    const parameters: ObjectiveParameters = { memberKey: normalizeForIdentity(member) };
    return {
      answer: contrast.label,
      capability: "discriminate" as const,
      // The member is the cue; the prompt layer adds the neighbours it must be separated from.
      cue: member,
      identityKey: objectiveIdentityKey({ capability: "discriminate", knowledgeIdentityKey: knowledge, parameters }),
      identityVersion: OBJECTIVE_IDENTITY_VERSION,
      knowledgeIdentityKey: knowledge,
      label: axis
        ? `Tell ${member} apart by ${axis}`
        : `Tell ${member} apart from ${contrast.siblings[0]?.label ?? "its neighbours"}`,
      parameters,
    };
  });
}

/**
 * A procedure, as one objective per step — contract R4's `procedural` kind.
 *
 * 🔴 EACH STEP IS CUED BY THE ONE BEFORE IT, AND THAT IS WHAT MAKES THIS ABOUT ORDER. Asking "what
 * are the steps?" is answerable by producing them in any order, and a learner who files proof of
 * service before serving the opposing party would pass it. Asking what FOLLOWS a given step cannot
 * be answered without holding the sequence.
 *
 * 🔴 AND THE FIRST STEP IS CUED BY THE PROCEDURE'S NAME, not skipped. "Where does this start" is
 * the one position no prior step can cue, and it is also the position a learner most often has
 * wrong — they know the middle of a process and not where it begins.
 *
 * 🔴 THE STEPS ARE NEVER SHOWN AS A SET. Nothing here emits the full list; a prompt that printed
 * the steps and asked for their order would be recognition wearing a sequence's name.
 */
function procedureObjectives(object: KnowledgeObject, steps: readonly ProcedureStep[]): LearningObjective[] {
  const knowledge = object.identityKey ?? knowledgeIdentityKey(object);
  const name = object.statement;
  return steps.map((step, index) => {
    const parameters: ObjectiveParameters = { stepKey: index + 1 };
    const previous = index === 0 ? undefined : steps[index - 1];
    return {
      answer: step.text,
      capability: "sequence" as const,
      cue: previous ? previous.text : name,
      identityKey: objectiveIdentityKey({ capability: "sequence", knowledgeIdentityKey: knowledge, parameters }),
      identityVersion: OBJECTIVE_IDENTITY_VERSION,
      knowledgeIdentityKey: knowledge,
      label: previous ? `Step ${index + 1} of ${name}` : `Where ${name} starts`,
      parameters,
    };
  });
}

/**
 * One source-grounded open semantic relation, as an explanation capability.
 *
 * The extractor says what the relationship is; this adapter does not classify it again or choose
 * a bespoke pedagogy. It gives the general controller a durable, stageable capability over the
 * source assertion, and the task/judge receive the relation's participants as expected evidence.
 */
function semanticExplanationObjective(object: KnowledgeObject): LearningObjective[] {
  if (!object.semanticRelations?.length) return [];
  const knowledge = object.identityKey ?? knowledgeIdentityKey(object);
  const parameters: ObjectiveParameters = {};
  return [{
    answer: object.statement,
    capability: "explain",
    cue: object.statement,
    identityKey: objectiveIdentityKey({ capability: "explain", knowledgeIdentityKey: knowledge, parameters }),
    identityVersion: OBJECTIVE_IDENTITY_VERSION,
    knowledgeIdentityKey: knowledge,
    label: `Explain the structure in: ${object.statement}`,
    parameters,
  }];
}

export function objectivesForKnowledge(object: KnowledgeObject): LearningObjective[] {
  if (object.type === "procedure" && object.steps?.length) {
    return procedureObjectives(object, object.steps);
  }
  if (object.type === "causal" && object.relation) return causalObjectives(object, object.relation);
  if (object.type === "spatial" && object.figure) return spatialObjectives(object, object.figure);
  if (object.type === "classification" && object.contrast) {
    return classificationObjectives(object, object.contrast);
  }
  if (object.type === "conceptual_system" && object.semanticRelations?.length) {
    return semanticExplanationObjective(object);
  }
  if (object.type !== "association" || !object.pair) return [];

  const knowledge = object.identityKey ?? knowledgeIdentityKey(object);
  // 🔴 NORMALISED FOR IDENTITY, ORIGINAL FOR DISPLAY. Normalisation exists to make two spellings of
  // one fact converge; it is not how the fact should be shown back to a learner. Using the folded
  // form in the label printed "produce cozaar" for a brand name the document capitalised — the
  // identity was right and the sentence was wrong.
  const left = object.pair.left;
  const right = object.pair.right;
  const { leftRole, rightRole } = object.pair;

  // 🔴 ROLES WHEN THE SOURCE NAMED ITS COLUMNS — the preferred form, because it describes what the
  // learner must PRODUCE. Both sides are carried with the value that fills them, so a glossary
  // printing `Generic | Brand` and a revision sheet printing `Brand | Generic` agree that Cozaar is
  // the brand, and converge instead of contradicting each other under a shared key.
  const sides: { cue: string; answer: string; parameters: ObjectiveParameters }[] =
    leftRole && rightRole
      ? [
          { answer: right, cue: left, parameters: { inputRole: leftRole, outputRole: rightRole } },
          { answer: left, cue: right, parameters: { inputRole: rightRole, outputRole: leftRole } },
        ]
      : // No column names, so nothing can be said about roles. Fall back to the canonical ordering
        // — sorted the same way the knowledge basis sorts, so at least the two documents that print
        // an unnamed pair in opposite orders still agree with each other.
        (() => {
          // Sorted by the NORMALISED form so two documents agree, but carrying the originals.
          const [first, second] = [left, right].sort((a, b) =>
            normalizeForIdentity(a).localeCompare(normalizeForIdentity(b)));
          return [
            { answer: second!, cue: first!, parameters: { direction: "left_to_right" as const } },
            { answer: first!, cue: second!, parameters: { direction: "right_to_left" as const } },
          ];
        })();

  return sides.map(({ answer, cue, parameters }) => ({
    answer,
    capability: "recall" as const,
    cue,
    identityKey: objectiveIdentityKey({ capability: "recall", knowledgeIdentityKey: knowledge, parameters }),
    identityVersion: OBJECTIVE_IDENTITY_VERSION,
    knowledgeIdentityKey: knowledge,
    // Presentation only. A canvas may word the prompt however it likes without moving identity.
    label: `Given ${cue}, produce ${answer}`,
    parameters,
  }));
}

/** Whether the knowledge identity a key belongs to was computed under the current rules.
 *
 *  Cheap enough to call before trusting a stored row, and the reason the version is in the key. */
export function knowledgeKeyIsCurrent(key: string): boolean {
  return key.split(":")[1] === `v${KNOWLEDGE_IDENTITY_VERSION}`;
}
