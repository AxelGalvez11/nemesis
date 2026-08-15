/**
 * Which rules decide what a document TEACHES — one comparable string.
 *
 * 🔴 THE SECOND HALF OF A PAIR, AND THE TWO MUST NOT MERGE. `PARSER_VERSION` (packages/shared)
 * answers *what could be read out of the bytes*: a better PDF reader, a new vision ladder, a raised
 * page cap. This answers *what could be understood out of the text we already read*: a lane that
 * learns to see a relation it used to refuse. They move independently and for different reasons, so
 * `needsReprocess` compares them side by side. Concatenating them into one fingerprint would make
 * every parser bump re-run every model call and every extractor bump re-read every file — paying
 * twice for a change that happened once.
 *
 * 🔴 THE RULE FOR WHEN THIS MOVES, STATED SO IT CAN BE CHECKED:
 *
 *     RULESET_VERSION changes IF AND ONLY IF one of the lane versions in `RULESET_LANES` changes.
 *
 * It is a COMPOSITION, never a hand-maintained string, and that is what makes both halves of the
 * rule structural rather than a promise. It cannot move for an unrelated edit, because nothing but
 * those constants feeds it — a refactor, a rename, a new helper, a deploy all leave it byte for
 * byte identical. And it cannot fail to move when a lane's rules change, because the lane's own
 * version is an input and every lane already bumps its own on a rules change.
 *
 * 🔴 WHAT COUNTS AS A LANE: anything that can change WHICH knowledge objects come out of the same
 * document. `knowledge-extraction.ts` (the grid, figure and procedure lanes),
 * `causal-extraction-contract.ts` (mechanisms), `knowledge-territory.ts` (the model's reading of
 * material). A lane left out of this list is a lane whose improvements can never reach the
 * documents that most needed them, which is why `ruleset-version.test.ts` carries a tripwire that
 * goes red when a version constant appears in this directory and is not composed in here.
 *
 * 🔴 WHAT IS DELIBERATELY NOT A LANE. `KNOWLEDGE_IDENTITY_VERSION` changes which KEY a fact is
 * stored under, not which facts are found, and `territoryReuse` already treats it as its own
 * separate rebuild trigger — folding it in here would make an identity migration look like an
 * extractor improvement and cost a model call per canvas for a change no lane made.
 * `OBJECTIVE_IDENTITY_VERSION` and `EVALUATOR_VERSION` are downstream of extraction entirely: they
 * change what is ASKED about a fact and how an answer is judged, never whether the fact is found.
 *
 * 🔴 AND THE COMPOSITION IS BYTE-IDENTICAL TO THE `GROUNDED_BUILD_RULES` IT REPLACES — same three
 * lanes, same `buildRules` sort. That is load-bearing, not tidiness: production holds a live
 * `mechanismsUnder` marker written under that exact string, and changing the composition would
 * silently invalidate it and buy a paid re-read of that canvas's material for no reason at all.
 * `ruleset-version.test.ts` asserts the equality against the literal set rather than trusting it.
 */

import { buildRules } from "./canvas-territory";
import { CAUSAL_EXTRACTION_VERSION } from "./causal-extraction-contract";
import { EXTRACTION_VERSION } from "./knowledge-extraction";
import { TERRITORY_VERSION } from "./knowledge-territory";

/**
 * Every lane whose rules can change the answer.
 *
 * Exported so the tripwire can compare it against what actually exists in this directory rather
 * than against a list written in a test, which would only ever restate this one.
 */
export const RULESET_LANES: readonly string[] = [
  TERRITORY_VERSION,
  CAUSAL_EXTRACTION_VERSION,
  EXTRACTION_VERSION,
];

/** The rules in force now. Sorted and joined by `buildRules`, so lane ORDER cannot change it. */
export const RULESET_VERSION = buildRules(RULESET_LANES);
