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
import type { KnowledgeObject } from "./knowledge-types";

/**
 * What the learner is being asked to DO.
 *
 * 🔴 DELIBERATELY THREE, NOT TWELVE. A full capability ontology written before a second knowledge
 * type has tested it would be eleven guesses and one fact — the same mistake as a ten-way payload
 * union. Only `recall` is minted today; `discriminate` and `explain` are named because identity
 * has to keep them APART (see the non-convergence tests), and naming them costs nothing while
 * inventing their parameters would cost a rewrite. Add a capability when something mints it.
 */
export type ObjectiveCapability = "recall" | "discriminate" | "explain";

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
  const { direction, inputRole, outputRole } = input.parameters;
  const role = inputRole && outputRole ? `in=${inputRole},out=${outputRole}` : "in=-,out=-";
  return `objective|${input.knowledgeIdentityKey}|${input.capability}|${role}|dir=${direction ?? "-"}`;
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
 */
export function objectivesForKnowledge(object: KnowledgeObject): LearningObjective[] {
  if (object.type !== "association" || !object.pair) return [];

  const knowledge = object.identityKey ?? knowledgeIdentityKey(object);
  const left = normalizeForIdentity(object.pair.left);
  const right = normalizeForIdentity(object.pair.right);
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
          const [first, second] = [left, right].sort();
          return [
            { answer: second!, cue: first!, parameters: { direction: "left_to_right" as const } },
            { answer: first!, cue: second!, parameters: { direction: "right_to_left" as const } },
          ];
        })();

  return sides.map(({ answer, cue, parameters }) => ({
    capability: "recall" as const,
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
