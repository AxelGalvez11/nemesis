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
const FUNC = strip(readFileSync(new URL("../../../../supabase/functions/science-search/index.ts", import.meta.url), "utf8"));
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

test("🔴🔴 the packet says the lane covers every field, not one", () => {
  // CLAUDE.md, owner 2026-07-27: Nemesis is field-agnostic and no feature may be scoped to one
  // discipline. This lane REPLACES four hardcoded medical domains that were drawn as if searched,
  // so an instruction that quietly re-scoped it to medicine would reintroduce the same defect with
  // a working backend behind it.
  assert.match(PACKET, /works for every field/i, "the packet no longer says the lane is field-agnostic");
  for (const field of ["law", "history", "engineering"]) {
    assert.ok(PACKET.includes(field), `${field} is no longer named as a field the literature covers`);
  }
});

test("🔴🔴🔴 the seven are NAMED, so widening the fan-out is a visible edit", () => {
  // Reading `registry.byDomain("literature")` instead would mean this action's reach changes
  // whenever someone registers a connector and tags it literature — a one-word edit in a file
  // nobody reviews for egress silently opening a new third-party call for every learner.
  const list = FUNC.slice(FUNC.indexOf("const LITERATURE_IDS"), FUNC.indexOf("] as const;"));
  assert.ok(list.length > 0, "LITERATURE_IDS is gone — this guard is pointed at nothing");
  for (const id of ["openalex", "crossref", "semantic-scholar", "europepmc", "pubmed", "arxiv", "biorxiv"]) {
    assert.ok(list.includes(`"${id}"`), `${id} left the literature set`);
  }
  assert.ok(!/byDomain\(/.test(FUNC), "the fan-out reads a domain tag again and can widen without an edit here");
  // …and the other thirty-five stay dark.
  for (const walled of ["uniprot", "chembl", "gnomad", "alphafold", "kegg"]) {
    assert.ok(!list.includes(`"${walled}"`), `${walled} is a life-sciences instrument and is now on for every learner`);
  }
});

test("🔴🔴 the broad gate still shuts the other thirty-five", () => {
  // `SCIENCE_SEARCH_ENABLED` exists to keep ~39 third-party egress paths dark. The honest way to
  // ship seven of them is a second door, not flipping that flag — which would open genomics,
  // proteomics, omics and chemistry as a side effect nobody asked for.
  //
  // Calibration: change the condition to `if (!enabled())` and this reddens.
  assert.match(FUNC, /if \(action !== "literature" && !enabled\(\)\)/, "the gate no longer distinguishes the literature action from the other 42");
  assert.match(FUNC, /if \(!userId\) return json\(\{ error: "authentication required" \}, 401, req\);/, "the literature door lost its authentication");
  const literatureBlock = FUNC.slice(FUNC.indexOf('if (action === "literature")'));
  assert.ok(
    FUNC.indexOf("const userId = await verifyUser(token)") < FUNC.indexOf('if (action === "literature")'),
    "the literature action now runs before the caller is authenticated — an open relay onto seven APIs",
  );
  assert.match(literatureBlock, /query too long/, "the literature action stopped bounding its query");
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
  assert.match(CHAT, /\(decision\?\.needsWeb \|\| \(decision\?\.needsPapers && !papersFetched\)\)/, "a papers-only turn no longer enters the loop at all");
});

test("🔴 papers join the SAME numbered list the answer cites over", () => {
  // The inline [n] markers resolve positionally over `sources`. A second list would need a second
  // numbering scheme and the model would have to keep both straight while writing.
  const block = CHAT.slice(CHAT.indexOf("if (decision.needsPapers && !papersFetched)"), CHAT.indexOf("if (decision.needsWeb)"));
  assert.match(block, /sources\.push\(paper\);/, "papers stopped entering the cited source list");
  assert.match(block, /if \(seen\.has\(paper\.url\)\) continue;/, "a paper can now be cited twice in one answer");
});

test("🔴 the dead brand does not identify us to a third party", () => {
  // OpenAlex takes the mailto as WHO IS CALLING. It read support@pharmaorb.app — a name CLAUDE.md
  // retired — which was harmless only while the connector was switched off.
  // Stripped, because the note explaining the fix necessarily quotes the address it removed —
  // and a guard that fires on its own rationale is a guard people delete.
  const openalex = strip(readFileSync(new URL("../../../../supabase/functions/_shared/science/literature/openalex.ts", import.meta.url), "utf8"));
  assert.ok(!/pharmaorb/i.test(openalex), "the retired brand is back in the contact we send to OpenAlex");
  assert.match(openalex, /enternemesis\.com/, "the polite-pool contact no longer names a live mailbox");
});
