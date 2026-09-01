/**
 * The model can put a picture from the learner's own lectures into an answer.
 *
 * 🔴 WHAT THIS IS FOR (owner 2026-08-31): *"I can ask it for things about my lectures, and it
 * should be able to pull images that it has stored into chat when necessary."* Every layer under
 * this existed for months — the figure store, the owner-scoped paths, the RLS, `figureAssetUrl` —
 * and nothing could reach them from a conversation.
 *
 * 🔴 THE RISK THIS TOOL CARRIES IS NOT A CRASH, IT IS A CONFIDENT LIE. The failure mode of a
 * picture tool is a reply that SAYS "here is the diagram" with no diagram in it: the model writes
 * a text link instead of an image, or retypes a 300-character signed URL and corrupts it, or gets
 * an empty result and describes a diagram from memory as though it came from the student's notes.
 * None of those throw and none of them look wrong in a log. So the assertions below are about the
 * SHAPE OF THE ANSWER handed to the model, which is the only lever this file has over that.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { AGENT_TOOLS, AGENT_TOOL_NAMES } from "./agent-tools";
import { WORKSPACE_TOOL_DESCRIPTIONS } from "@nemesis/shared";

const SOURCE = readFileSync(new URL("./agent-tools.ts", import.meta.url), "utf8");

test("🔴 the tool is advertised, described and dispatched — all three, or it is a dead control", () => {
  // A tool in the schema with no dispatch case answers "Unknown tool" to the model, which then
  // apologises to the student for something that was never wired up. A tool dispatched but not
  // advertised is never called at all. Both have shipped in this repo before.
  assert.ok((AGENT_TOOL_NAMES as readonly string[]).includes("find_figure"), "not in the catalogue");
  assert.ok(AGENT_TOOLS.some((t) => t.function.name === "find_figure"), "no schema sent to the model");
  assert.match(SOURCE, /case "find_figure": return await findFigure\(args\);/, "no dispatch case");
});

test("🔴 the description tells the model to PASTE the markdown, not to compose a link", () => {
  const description = WORKSPACE_TOOL_DESCRIPTIONS.find_figure;
  // The single instruction that decides whether a student sees a picture or a sentence about one.
  assert.match(description, /verbatim/i, "nothing tells the model to paste it unchanged");
  assert.match(description, /markdown/i, "the field it must paste is never named");
  assert.match(description, /never rewrite the URL/i, "nothing forbids retyping the signed URL");
  // 🔴 AND WHAT TO DO WITH NOTHING. Without this the model fills the gap from its own training —
  // a plausible diagram the student's lecture does not contain, presented as though it did.
  assert.match(description, /rather than describing one from memory/i, "no rule for an empty result");
  // Aimed by what the picture SHOWS, because a learner asks for a nephron, not for a file name.
  assert.match(description, /not a file name/i, "the model will search by filename");
});

test("🔴 the answer is a finished image link, and a picture that cannot be signed is dropped", () => {
  // Mirrors `findFigure`'s assembly against the same rules, so the shape is pinned without a
  // network. The two behaviours that matter:
  //   1. `markdown` is a complete image (leading `!`), never a bare link.
  //   2. A row whose URL would not sign is DROPPED, never returned description-only — a result
  //      carrying a description and no picture is exactly what makes the model promise one.
  assert.match(SOURCE, /markdown: `!\[\$\{/, "the tool hands back a link, not an image");
  assert.match(SOURCE, /if \(!url\) continue;/, "an unsignable picture is returned anyway");
});

test("🔴 the alt text cannot break the image it is attached to", () => {
  // A vision description is a paragraph. Newlines end a markdown image mid-render, and a stray
  // square bracket closes the alt text early and leaves the URL as visible junk in the reply.
  assert.match(SOURCE, /replace\(\/\[\\r\\n\]\+\/g, " "\)/, "newlines are not flattened out of alt text");
  assert.match(SOURCE, /replace\(\/\[\[\\\]\]\/g, ""\)/, "brackets are not stripped from alt text");
});

test("🔴 the search runs in Postgres, scoped by RLS rather than by a hand-written owner check", () => {
  // 🔴 TWO CLAIMS, AND THE SECOND IS THE SECURITY ONE. Walking the jsonb here would mean pulling
  // every parsed structure the learner owns across the wire to return one picture. And
  // `search_figures` is SECURITY INVOKER, so row-level security scopes it to the caller — there is
  // deliberately no `user_id = ...` filter in this file, because a filter that can be written can
  // be forgotten, and the branch that forgot it would serve one student another student's work.
  assert.match(SOURCE, /supabase\.rpc\("search_figures"/, "the search moved into the client");
  const migration = readFileSync(
    new URL("../../../../supabase/migrations/20260901T10_search_figures.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /security invoker/i, "the function would bypass row-level security");
  assert.match(migration, /grant execute on function public\.search_figures/i, "learners cannot call it");
});

test("🔴 the number of pictures is bounded at both ends, whatever the model asks for", () => {
  // An unbounded `limit` turns one question into a gallery and a wall of signed URLs in the
  // context window; a zero or negative one returns nothing and reads as "you have no pictures".
  assert.match(SOURCE, /Math\.max\(1, Math\.min\(asked, FIGURE_LIMIT_MAX\)\)/, "the limit is not clamped");
  assert.match(SOURCE, /FIGURE_LIMIT_MAX = 6/, "the ceiling moved without this guard noticing");
});

test("🔴 a picture nobody described is still showable, and never gets empty alt text", () => {
  // 🔴 FOUND BY DRIVING THE REAL APP, NOT BY READING THE CODE. A learner dropped a lecture, the
  // picture was decoded, stored and correctly joined — and "show me the picture from my Bending
  // stress lecture" returned nothing, because both this file and `search_figures` assumed every
  // stored figure carries a description. Vision had recorded `skipped: "examined-empty"`, so the
  // picture existed, was reachable, and was invisible to the only tool that can show it.
  //
  // Requiring a description is right for a SEARCH and wrong for a BROWSE: "a picture from my X
  // lecture" has no search terms, so there is nothing to match and nothing to be missing.
  assert.match(SOURCE, /row\.description\?\.trim\(\) \?\? ""/, "an undescribed row would throw");
  assert.match(SOURCE, /Picture from \$\{row\.file_name\}/, "an undescribed picture gets empty alt text");

  const migration = readFileSync(
    new URL("../../../../supabase/migrations/20260901T20_search_figures_browse.sql", import.meta.url),
    "utf8",
  );
  // The browse case must not require a description, and the search case still must.
  assert.match(migration, /trim\(p_query\) = ''\s*\n\s*or \(description is not null/, "browse and search share one filter again");
});

test("🔴 a word search that finds nothing widens to the lecture's pictures, without asking the model", () => {
  // 🔴 OBSERVED ON PRODUCTION 2026-09-01, DRIVING THE REAL APP. The picture was stored, joined and
  // reachable; the model DID call this tool; and the student got "I can look again with a different
  // search, or check what figures that lecture actually contains." An offer to retry is not a
  // picture. The figure carried no description, so a word search could never match it, and the
  // browse path that would have found it was one the model had to choose and did not.
  //
  // Putting the retry in the tool description would add a round trip and a second decision between
  // the student and their diagram — and the model has already demonstrated it prefers to ask.
  assert.match(SOURCE, /if \(\(data \?\? \[\]\)\.length === 0 && query !== ""\)/, "an empty result is final again");
  assert.match(SOURCE, /widened = true/, "the widened search is not recorded");
  // And it must SAY so, or a near-miss is presented as an exact answer.
  assert.match(SOURCE, /Nothing matched those words, so these are the pictures that lecture holds/, "the widening is silent");
});
