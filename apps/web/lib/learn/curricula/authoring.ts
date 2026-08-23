// The authoring shorthand for the curriculum library.
//
// 🔴 SUGAR, NOT A SCHEMA. Everything here compiles down to the exact `CurriculumSkeleton` shape
// `curriculum-registry.ts` defines, through the same `conceptIdentityKey` mint — a course written
// with `course()` and one written longhand (GENERAL_CHEMISTRY still is) are indistinguishable to
// every reader. The sugar exists because the library is ~a hundred skeletons and the longhand's
// per-node ceremony (key, parentKey, position) is exactly the part a human reviewer never checks
// and a helper never gets wrong.
//
// 🔴 EVERY SKELETON MINTED HERE IS `provisional` AND `nemesis-authored`, WITH NO OVERRIDE
// PARAMETER — that is the owner's sweep ruling (2026-08-23: build the whole library at once,
// machine-written, honestly labelled). Promotion to `reviewed`/`canonical` is a human edit to the
// skeleton itself, in a diff, which is what the maturity ladder means by "never silently".
//
// 🔴 STRUCTURE IS SYNTHESISED, NOT COPIED — the standing provenance argument on GENERAL_CHEMISTRY
// applies to every course in this directory. "Derivatives before integrals" and "contracts before
// remedies" are facts about fields, like alphabetical order; no publisher's table of contents or
// exam framework's arrangement is reproduced. AP and licensure outlines are ALIGNMENT TARGETS:
// read to ask "does ours cover what theirs tests", never ingested (licensed-source.ts refuses the
// role by name).
//
// PURE. No React, no I/O, no model call.

import { conceptIdentityKey } from "../concept-identity";
import type { CurriculumNode, CurriculumSkeleton } from "../curriculum-registry";

/** One topic as authored: a label, how learners also name it, what competence looks like. */
export interface TopicSpec {
  readonly label: string;
  readonly aliases?: readonly string[];
  /** Shorthand for a single outcome — most nodes have exactly one worth stating. */
  readonly outcome?: string;
  readonly outcomes?: readonly string[];
  /** Sub-topics. One level only — the registry refuses deeper nesting at read time. */
  readonly children?: readonly TopicSpec[];
}

/** `t("Stoichiometry", { aliases: ["mole calculations"], outcome: "…" })` — a node, tersely. */
export function t(label: string, spec: Omit<TopicSpec, "label"> = {}): TopicSpec {
  return { label, ...spec };
}

function nodesFrom(domain: string, topics: readonly TopicSpec[]): CurriculumNode[] {
  const nodes: CurriculumNode[] = [];
  topics.forEach((topic, at) => {
    nodes.push({
      aliases: topic.aliases ?? [],
      conceptKey: conceptIdentityKey({ domain, label: topic.label }),
      label: topic.label,
      outcomes: topic.outcomes ?? (topic.outcome ? [topic.outcome] : []),
      parentKey: null,
      position: at + 1,
    });
    (topic.children ?? []).forEach((child, childAt) => {
      nodes.push({
        aliases: child.aliases ?? [],
        conceptKey: conceptIdentityKey({ domain, label: child.label }),
        label: child.label,
        outcomes: child.outcomes ?? (child.outcome ? [child.outcome] : []),
        parentKey: conceptIdentityKey({ domain, label: topic.label }),
        position: childAt + 1,
      });
    });
  });
  return nodes;
}

/**
 * A whole course. `aliases` are COURSE names a learner would type ("gen chem", "calc 1",
 * "ap biology"), never bare field names — "biology" alone is deliberately not an alias anywhere,
 * because the turn contract makes that exact utterance a clarifying question (general vs cell vs
 * human), and an alias that answered it would bypass the question the model is told to ask.
 */
export function course(
  domain: string,
  title: string,
  aliases: readonly string[],
  topics: readonly TopicSpec[],
): CurriculumSkeleton {
  return {
    aliases,
    domain,
    // Same key recipe GENERAL_CHEMISTRY uses ("general chemistry curriculum"), so the two
    // authoring styles mint identical identities for identical subjects.
    key: conceptIdentityKey({ domain, label: `${title.toLowerCase()} curriculum` }),
    maturity: "provisional",
    nodes: nodesFrom(domain, topics),
    provenance: "nemesis-authored",
    title,
    version: 1,
  };
}
