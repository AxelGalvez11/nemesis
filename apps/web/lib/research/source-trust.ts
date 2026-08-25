// How much weight a web source carries, decided WITHOUT knowing what field the question is in.
//
// 🔴 THIS FILE IS THE WHOLE REASON DEEP RESEARCH COULD NOT SHIP GENERALIST, so the history matters.
// The PharmaOrb engine ranked a source by looking its hostname up in a hardcoded list — nejm.org,
// thelancet.com, cochrane.org, jamanetwork.com, uptodate.com, fda.gov and about twenty more — and
// anything absent scored "low", which meant DROPPED ENTIRELY before the model ever saw it.
//
// For a medical tool that is defensible. For Nemesis it is a silent lie, and the failure is worse
// than a thin answer:
//
//   an engineering student researching a control system — IEEE is not on the list, so DROPPED
//   a historian on the Gracchi                          — JSTOR, Cambridge, Oxford, all DROPPED
//   a law student on the commerce power                 — CourtListener DROPPED; Cornell survived
//                                                         only by the accident of being a .edu
//
// Each of them gets a report saying the evidence is thin, when what actually happened is that we
// deleted it. A student cannot tell those two apart, which is what makes it a lie rather than a bug.
//
// 🔴 THE FIX IS NOT A LONGER LIST. Adding IEEE and JSTOR would fail the next student, and the one
// after that, forever; CLAUDE.md names this exact trap ("prefer structural signals over
// subject-matter keyword lists, which never generalise"). So the allowlist is gone and nothing
// replaces it. What is left is:
//
//   1. a SMALL BLOCKLIST of page shapes that carry no primary information in ANY field, and
//   2. STRUCTURAL signals — a registered identifier, an institutional domain suffix — that mean the
//      same thing whether the subject is cardiology, tort law or fluid dynamics.
//
// 🔴 AND RANK IS NOT A GATE. The old list did double duty: it ordered sources AND decided which
// ones existed. That was always the wrong job for it. `web-research.ts` said so itself — "the
// reranker and faithfulness judge are the precision gates" — and then let a domain list overrule
// both. Here rank only ORDERS. What a claim is allowed to say is settled downstream by
// `verify.ts`, against the passage actually retrieved, which is a check the source's address
// cannot pass or fail on its behalf.

/** Higher is better. Ordering only: see the header — this never decides whether a source is used. */
export type SourceRank = "primary" | "reference" | "ordinary";

export interface RankedSource {
  rank: SourceRank;
  /** Why it ranked where it did, in words, so a reader can disagree with us. */
  reason: string;
}

/**
 * Page shapes with no primary information in any discipline.
 *
 * 🔴 EVERY ENTRY HAS TO BE SUBJECT-NEUTRAL, and that is the test for adding one: a content farm is
 * useless to a nurse and a machinist alike. The moment an entry would only bother one field, it
 * belongs in a search query, not in this list.
 *
 * Kept deliberately short. A blocklist that grows is an allowlist wearing a different hat, and the
 * cost of a bad source surviving to `verify.ts` is one discarded claim, while the cost of a good
 * source being dropped here is invisible to everybody.
 */
const NO_PRIMARY_CONTENT = [
  "pinterest.com",
  "quizlet.com",
  "coursehero.com",
  "chegg.com",
  "studocu.com",
  "brainly.com",
  "answers.com",
  "ehow.com",
  "wikihow.com",
  "slideshare.net",
  "scribd.com",
];

/**
 * Suffixes that mean an institution stands behind the page, in any country and any field.
 *
 * These are STRUCTURAL: a government, a university or a treaty body is identifiable from the shape
 * of the name rather than from knowing the subject. `.edu` covers a US university's law review and
 * its materials-science group without either being named.
 */
const INSTITUTIONAL = [
  ".gov",
  ".mil",
  ".int",
  ".edu",
  ".ac.uk",
  ".gov.uk",
  ".edu.au",
  ".ac.jp",
  ".gouv.fr",
  ".gc.ca",
  ".europa.eu",
];

/**
 * Hosts that mint or resolve a REGISTERED IDENTIFIER for a work — a DOI, an arXiv id, a docket
 * number, a patent, a standard.
 *
 * 🔴 THIS IS THE ONE THAT REPLACES THE JOURNAL LIST, and it is not the same kind of thing. The old
 * list named publishers, so it could only ever recognise the publishers somebody had thought of.
 * A DOI is a registration, not a subject: `doi.org` resolves a paper in comparative literature and
 * one in orthopaedic surgery by the identical mechanism. Naming the RESOLVER covers every publisher
 * that has ever registered with it, including the ones that do not exist yet.
 */
const REGISTRY = [
  "doi.org",
  "arxiv.org",
  "ssrn.com",
  "zenodo.org",
  "osf.io",
  "biorxiv.org",
  "medrxiv.org",
  "hal.science",
  "worldcat.org",
  "handle.net",
];

/** Strict domain-suffix match. Inherited from the engine this replaces, and inherited for a reason:
 *  its predecessor used `host.includes(d)`, so "nejm.org.attacker.example" read as trusted. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  if (domain.startsWith(".")) return host === domain.slice(1) || host.endsWith(domain);
  return host === domain || host.endsWith(`.${domain}`);
}

/** The hostname, lowercased, or "" when the URL will not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Whether this source may be cited at all.
 *
 * 🔴 ALMOST EVERYTHING PASSES, AND THAT IS THE DESIGN. A source earns its place by having a passage
 * that actually supports the claim made from it; that is checked later, per claim, against the text
 * we really retrieved. Refusing a page here on the strength of its address means refusing it on a
 * guess, and the old engine's guess was wrong for every student outside medicine.
 */
export function citable(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return !NO_PRIMARY_CONTENT.some((d) => hostMatchesDomain(host, d));
}

/**
 * Where a source sits when two of them say different things.
 *
 * Used to ORDER the pool and to break ties in synthesis. Nothing here removes a source, and a
 * source's rank never licenses a claim its own passage does not support.
 */
export function rankSource(url: string): RankedSource {
  const host = hostOf(url);
  if (!host) return { rank: "ordinary", reason: "the address could not be read" };
  if (REGISTRY.some((d) => hostMatchesDomain(host, d))) {
    return { rank: "primary", reason: "carries a registered identifier for the work itself" };
  }
  if (INSTITUTIONAL.some((d) => hostMatchesDomain(host, d))) {
    return { rank: "primary", reason: "published by a government, university or treaty body" };
  }
  // An encyclopaedia is a good place to start and a poor place to finish: solid orientation, and
  // its own text tells you it is summarising somebody else. Reference, never primary.
  if (hostMatchesDomain(host, "wikipedia.org") || hostMatchesDomain(host, "britannica.com")) {
    return { rank: "reference", reason: "an encyclopaedia: orientation, and it cites its own sources" };
  }
  return { rank: "ordinary", reason: "an ordinary web page, judged on what its text actually says" };
}

/** Sort order for the pool. Stable: equal ranks keep the order the search returned. */
const ORDER: Record<SourceRank, number> = { ordinary: 2, primary: 0, reference: 1 };

export function byRank<T extends { url: string }>(sources: readonly T[]): T[] {
  return sources
    .map((source, i) => ({ i, rank: ORDER[rankSource(source.url).rank], source }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((entry) => entry.source);
}
