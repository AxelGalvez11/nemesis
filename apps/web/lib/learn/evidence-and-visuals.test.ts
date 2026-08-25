import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { turnRouterMessages, type TurnContext } from "./turn-router";

// ── what buys a search, and what a search may reach ──────────────────────────────────────────
//
// Two owner instructions from 2026-08-24, from one message:
//
//   *"Applying the literature seven. Plug the literature seven."*
//   *"DeepSeek was running a web search when we asked it to show us a visual for a topic we were
//    on. It shouldn't run website searches when it has a visual to use — web searches are for
//    having up-to-date information, or evidence, sources."*
//
// They pull in opposite directions and that is the point: one ADDS a lane the product never had,
// the other REMOVES a search it should never have bought. Both are about the same question —
// what is a search actually FOR — so they are guarded together.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTER = strip(readFileSync(new URL("./turn-router.ts", import.meta.url), "utf8"));
const CHAT = strip(readFileSync(new URL("../../components/workspace/learn/canvas-chat.ts", import.meta.url), "utf8"));
const API = strip(readFileSync(new URL("../workspace/chat-api.ts", import.meta.url), "utf8"));
const FUNC = strip(readFileSync(new URL("../../../../supabase/functions/nemesis-literature/index.ts", import.meta.url), "utf8"));
const SCIENCE = strip(readFileSync(new URL("../../../../supabase/functions/science-search/index.ts", import.meta.url), "utf8"));
const PROXY = strip(readFileSync(new URL("../../app/api/workspace/scholar/route.ts", import.meta.url), "utf8"));

const EMPTY: TurnContext = {
  canvasTitle: "",
  clarified: [],
  courseRequested: false,
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  materialContext: "",
  memory: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 3,
  sources: 0,
  stagedPassage: "",
  toolCatalogue: "",
  toolContext: "",
  toolRoundsLeft: 0,
  today: "Tuesday, 25 August 2026",
  webContext: "",
};

const PACKET = turnRouterMessages({ context: EMPTY, utterance: "show me a diagram of meiosis" })
  .map((message) => message.content)
  .join("\n");

test("🔴🔴🔴 asking to SEE something is not a reason to search", () => {
  // The cause was never a bad judgement by the model — it was the tie-break. The false list names
  // explanations, definitions, calculations and translations; a request for a PICTURE is none of
  // those, so it fell through to "when genuinely borderline, say true" and bought a Brave search
  // on the way to a drawing the renderers make from the model's own knowledge.
  //
  // Calibration: delete the sentence from turn-router.ts and this reddens.
  assert.match(PACKET, /Being asked to SHOW, draw or diagram something is not by itself a reason to search/);
  assert.match(PACKET, /needsWeb false/, "the packet stopped saying which way to decide for a drawing");
});

test("🔴🔴 …but the rule is about the DATA, not about the picture", () => {
  // "Never search for a visual" would be its own wrong answer: a plot of this year's figures needs
  // this year's figures. A guard that only checked for the prohibition would happily pass a packet
  // that had over-corrected into refusing to look up data it needs.
  assert.match(PACKET, /Judge the DATA, not the picture/, "the packet lost the half that keeps a current-data plot searchable");
  assert.match(PACKET, /themselves current/, "the exception for live figures is gone");
});

test("🔴🔴🔴 the literature lane is a SEPARATE decision from the web", () => {
  // Folding them into one flag would mean "what does the evidence say" got whatever the open web
  // ranked that morning. What has been SHOWN is usually not a question about what is current — the
  // trial that settles it may be decades old, and a freshness-ranked web search will not find it.
  assert.match(ROUTER, /needsPapers: boolean;/, "the papers decision is gone from the contract");
  assert.match(PACKET, /"needsPapers": true \| false/, "the model is not told the field exists");
  assert.match(PACKET, /It is independent of needsWeb/, "the packet stopped saying the two are separate decisions");
  assert.match(ROUTER, /needsPapers: parsed\.needsPapers === true,/, "the decision stopped being read off the model's answer");
});

test("🔴🔴🔴 the evidence trigger is an INTENT, and its examples are not one field's vocabulary", () => {
  // CLAUDE.md, owner 2026-07-27: Nemesis is field-agnostic and no feature may be scoped to one
  // discipline. This lane REPLACES four hardcoded medical domains that were drawn as if searched,
  // so an instruction that quietly re-scoped it to medicine would reintroduce the same defect with
  // a working backend behind it.
  //
  // 🔴 STRENGTHENED 2026-08-24 AFTER THE OWNER ASKED "are these hardcoded keywords? it needs to be
  // by intent". The code answer was already yes-by-intent — there is no matcher anywhere near the
  // learner's text, guarded below. But the INSTRUCTION was leaking the same failure in prose: it
  // read "wants studies, trials, a systematic review or a meta-analysis", and all three named forms
  // are clinical-research artefacts. A model given only those examples generalises toward medicine
  // and under-fires for the learner asking "what's the authority for that". This guard used to
  // check for the sentence "works for every field", which a re-scoped instruction could keep while
  // meaning the opposite; it now checks the two things that actually make the trigger field-neutral.
  const clause = PACKET.slice(
    PACKET.indexOf('"needsPapers" is true'),
    PACKET.indexOf("It is independent of needsWeb"),
  );
  assert.ok(clause.length > 0, "the needsPapers instruction is gone — this guard is pointed at nothing");

  // 1. It says outright that the words are not the trigger.
  assert.match(clause, /never the words they used/i, "the packet stopped telling the model to judge the ask rather than the wording");
  assert.match(clause, /never a vocabulary/i, "the packet stopped warning against matching a vocabulary");

  // 2. Its worked examples span disciplines, so no single field's phrasing is the pattern. Four,
  //    not one: a lone counter-example beside three medical ones still reads as a medical rule.
  const disciplines = ["law", "historiographical", "engineering", "education", "clinical"];
  const named = disciplines.filter((d) => clause.includes(d));
  assert.ok(
    named.length >= 4,
    `the evidence examples now span only ${named.length} discipline(s) (${named.join(", ")}) — a model reading them will generalise to that field`,
  );
});

test("🔴🔴🔴 nothing in the router matches the learner's WORDS — the decision is the model's", () => {
  // Owner 2026-08-24: *"are these hardcoded keywords? it needs to be by intent."*
  //
  // The header already records that the first version of a sibling decision WAS a regex
  // (`readResearchAsk`) and was deleted within a day, and that `chat-intent.ts` had deleted a
  // `RESEARCH_PATTERN` before that for the same reasons — a learner writing "I need everything on X
  // for my essay, with sources" got nothing, and a learner writing in Spanish could never match at
  // all. This asserts the property directly rather than trusting that history.
  const onUtterance = ROUTER.match(/utterance[^\n;]*?(\.includes\(|\.match\(|\.search\(|\.test\(|RegExp)/g) ?? [];
  assert.deepEqual(
    onUtterance,
    [],
    `the router inspects the learner's text again: ${onUtterance.join(" | ")} — routing must be the model's judgement, not a pattern`,
  );
  const patternOnText = ROUTER.match(/\/[^\n/]+\/[a-z]*\.(test|exec)\(\s*(utterance|question)\b/g) ?? [];
  assert.deepEqual(
    patternOnText,
    [],
    `a regex is being run against the learner's text: ${patternOnText.join(" | ")}`,
  );
});

test("🔴🔴🔴 the six are NAMED, so widening the fan-out is a visible edit", () => {
  // Reading `registry.byDomain("literature")` instead would mean this action's reach changes
  // whenever someone registers a connector and tags it literature — a one-word edit in a file
  // nobody reviews for egress silently opening a new third-party call for every learner.
  //
  // 🔴 THIS GUARD PINNED SEVEN UNTIL 2026-08-24, WHEN THE OWNER CUT bioRxiv: *"i guess we dont need
  // biorxiv."* It is narrowed rather than deleted, and the reversal is written down, because the
  // guard's real subject is "no source enters or leaves this lane without an edit to that list" —
  // which is exactly as true at six as at seven. bioRxiv went because it is the only index with no
  // search endpoint: relevance had to be guessed on its behalf, and it guessed a neuroscience
  // preprint into a property-law answer.
  const list = FUNC.slice(FUNC.indexOf("const LITERATURE_IDS"), FUNC.indexOf("] as const;"));
  assert.ok(list.length > 0, "LITERATURE_IDS is gone — this guard is pointed at nothing");
  for (const id of ["openalex", "crossref", "semantic-scholar", "europepmc", "pubmed", "arxiv"]) {
    assert.ok(list.includes(`"${id}"`), `${id} left the literature set`);
  }
  // 🔴 AND THE INVERSE, so restoring it is a deliberate act rather than a merge artefact. Anyone
  // putting bioRxiv back must first read why it left — and must repair the guessing, not just the
  // list. biorxiv.test.ts holds that repair.
  assert.ok(
    !list.includes('"biorxiv"'),
    "bioRxiv is back in the literature fan-out — the owner removed it 2026-08-24; it has no search endpoint, so this lane would be guessing relevance again",
  );
  assert.ok(!/byDomain\(/.test(FUNC), "the fan-out reads a domain tag again and can widen without an edit here");
  // …and the other thirty-five stay dark.
  for (const walled of ["uniprot", "chembl", "gnomad", "alphafold", "kegg"]) {
    assert.ok(!list.includes(`"${walled}"`), `${walled} is a life-sciences instrument and is now on for every learner`);
  }
});

test("🔴🔴🔴 the other thirty-five are not DEPLOYED, which beats being gated", () => {
  // 🔴 THIS TEST USED TO CHECK A RUNTIME FLAG, AND THE STRONGER GUARANTEE REPLACED IT. The lane
  // began as an action inside `science-search`, which imports the whole 42-connector registry and
  // keeps the rest dark behind `SCIENCE_SEARCH_ENABLED`. A flag is a decent guarantee; NOT SHIPPING
  // THE CODE is a better one. `nemesis-literature` imports the seven modules by name and never
  // touches the registry, so the egress paths for genomics, proteomics, omics, chemistry and
  // pathways are not present in the deployed function at all — and no future edit to a gate,
  // anywhere, can expose them.
  assert.ok(!/registry/.test(FUNC), "the literature function reached for the shared registry again — that imports all 42");
  assert.ok(!/byDomain\(/.test(FUNC), "the fan-out reads a domain tag again and can widen without an edit here");
  assert.match(FUNC, /from "\.\.\/_shared\/science\/literature\/index\.ts"/, "the seven are no longer imported by name");
  for (const walled of ["uniprot", "chembl", "gnomad", "alphafold", "kegg", "reactome"]) {
    assert.ok(!FUNC.includes(walled), `${walled} is reachable from the literature function`);
  }

  // …and science-search is left exactly as it was: still gated, still undeployed.
  assert.match(SCIENCE, /if \(!enabled\(\)\) return json\(\{ error: "science_search_disabled" \}, 503, req\);/, "science-search's gate was weakened on the way past");
  assert.ok(!/literature/i.test(SCIENCE.replace(/import literature[^\n]*/g, "")), "the literature action leaked back into the 42-connector function");
});

test("🔴🔴 the literature door authenticates before it reaches any upstream", () => {
  // Free upstreams still make an unauthenticated door an open relay onto seven third-party APIs.
  assert.match(FUNC, /if \(!userId\) return json\(\{ error: "authentication required" \}, 401, req\);/, "the literature door lost its authentication");
  assert.ok(
    FUNC.indexOf("const userId = await verifyUser(token)") < FUNC.indexOf("await searchLiterature("),
    "the fan-out now runs before the caller is authenticated",
  );
  assert.match(FUNC, /query too long/, "the literature action stopped bounding its query");
  assert.match(FUNC, /is_anonymous/, "anonymous sessions can now use the lane");
});

test("🔴🔴 one failing index is not a failed search, and papers never fail a turn", () => {
  // PubMed rate-limiting us must not turn six good answers into an error, and a literature outage
  // must leave an answer built on the web and the learner's own material rather than an error.
  assert.match(FUNC, /Promise\.allSettled/, "one slow index can now fail the whole fan-out");
  assert.ok(!/await Promise\.all\(/.test(FUNC), "the fan-out went back to all-or-nothing");
  const client = API.slice(API.indexOf("export async function searchLiteratureContext"), API.indexOf("export async function searchWebContext"));
  assert.ok(client.length > 0, "searchLiteratureContext is gone — this guard is pointed at nothing");
  assert.match(client, /catch \{\s*return \[\];/, "a literature failure can now throw into the turn");
  assert.match(client, /if \(!response\.ok\) return \[\];/, "an upstream error is no longer swallowed into an empty list");
  assert.match(PROXY, /return Response\.json\(\{ hits: \[\] \}, \{ status: 200 \}\)/, "the proxy turned a literature outage into a turn-level error");
});

test("🔴🔴 papers are deduped across the indexes, because the overlap is the norm", () => {
  // Europe PMC mirrors PubMed, OpenAlex and Crossref share DOIs, and a preprint usually appears
  // twice. Undeduped, a five-paper answer cites the same study three times and reads as three
  // independent findings — which manufactures agreement, and is worse than showing fewer papers.
  const merge = FUNC.slice(FUNC.indexOf("async function searchLiterature("));
  assert.match(merge, /const seen = new Set<string>\(\)/, "the merge stopped deduping");
  assert.match(merge, /if \(seen\.has\(key\)\) continue;/, "duplicate papers reach the answer again");
});

test("🔴 the papers fetch runs once per turn, not once per round", () => {
  // `needsWeb` is re-decided every round because a search can be re-aimed. The fan-out cannot be:
  // it is seven indexes asked the same question, so asking again returns the same papers. Without
  // the latch, a turn with needsPapers true and needsWeb false re-runs it until the round cap.
  assert.match(CHAT, /let papersFetched = false;/, "the papers latch is gone — the fan-out can now repeat every round");
  assert.match(CHAT, /decision\.needsPapers && !papersFetched/, "the latch is no longer checked before fetching");
  // 🔴 THE CONDITION IS READ AS A SET OF CLAUSES, NOT AS ONE LITERAL STRING. It gained a third
  // lane on 2026-08-25 (workspace tools), and a regex pinning the exact two-clause spelling
  // reddened over the ADDITION rather than over anything breaking. What this guard is about is
  // that a papers-only turn can still get in, so that is what it reads.
  const header = CHAT.slice(CHAT.indexOf("round < MAX_SEARCH_ROUNDS"), CHAT.indexOf("round += 1", CHAT.indexOf("round < MAX_SEARCH_ROUNDS")));
  assert.match(header, /decision\?\.needsWeb/, "the loop no longer ends on the model's own answer");
  assert.match(header, /decision\?\.needsPapers && !papersFetched/, "a papers-only turn no longer enters the loop at all");
});

test("🔴 papers join the SAME numbered list the answer cites over", () => {
  // The inline [n] markers resolve positionally over `sources`. A second list would need a second
  // numbering scheme and the model would have to keep both straight while writing.
  const block = CHAT.slice(CHAT.indexOf("if (decision.needsPapers && !papersFetched)"), CHAT.indexOf("if (decision.needsWeb)"));
  assert.match(block, /sources\.push\(paper\);/, "papers stopped entering the cited source list");
  assert.match(block, /if \(seen\.has\(paper\.url\)\) continue;/, "a paper can now be cited twice in one answer");
});

test("🔴🔴 nothing identifies Nemesis to a third party as somebody else", () => {
  // Three strings, one defect, found one at a time: OpenAlex's `mailto` fallback said
  // support@pharmaorb.app (a brand CLAUDE.md retired), Crossref's said
  // support@syntheticsciences.ai (the open-source project these connectors were derived from), and
  // the shared User-Agent announced "openscience-science/1.0". Scholarly APIs read all three to set
  // rate limits and to reach an operator whose traffic misbehaves — so each one both misattributed
  // our traffic to someone else and left us unreachable. Harmless while the connectors were off;
  // live the moment the lane is deployed, which is what made them worth finding.
  // 🔴 biorxiv STAYS ON THIS LIST THOUGH IT LEFT THE FAN-OUT. This guard is about what the SOURCE
  // FILES say, not about which of them this lane calls: biorxiv.ts is still in the tree and still
  // reachable from `ask` behind SCIENCE_CONNECTORS. Dropping it here because the literature lane no
  // longer uses it would recreate precisely the condition that let these three strings survive for
  // months — a connector nobody checks because nobody is currently calling it.
  const literature = ["openalex", "crossref", "pubmed", "europepmc", "arxiv", "biorxiv", "semantic-scholar"];
  for (const name of literature) {
    const source = strip(readFileSync(new URL(`../../../../supabase/functions/_shared/science/literature/${name}.ts`, import.meta.url), "utf8"));
    assert.ok(!/pharmaorb|syntheticsciences/i.test(source), `${name} identifies us to its upstream as somebody else`);
  }
  const http = strip(readFileSync(new URL("../../../../supabase/functions/_shared/science/http.ts", import.meta.url), "utf8"));
  assert.ok(!/syntheticsciences|openscience-science/i.test(http), "the shared User-Agent names another project again");
  assert.match(http, /Nemesis\/1\.0/, "the User-Agent no longer names this product");
});

test("🔴 the OpenAlex polite-pool contact is a live mailbox", () => {
  // OpenAlex takes the mailto as WHO IS CALLING. It read support@pharmaorb.app — a name CLAUDE.md
  // retired — which was harmless only while the connector was switched off.
  // Stripped, because the note explaining the fix necessarily quotes the address it removed —
  // and a guard that fires on its own rationale is a guard people delete.
  const openalex = strip(readFileSync(new URL("../../../../supabase/functions/_shared/science/literature/openalex.ts", import.meta.url), "utf8"));
  assert.ok(!/pharmaorb/i.test(openalex), "the retired brand is back in the contact we send to OpenAlex");
  assert.match(openalex, /enternemesis\.com/, "the polite-pool contact no longer names a live mailbox");
});
