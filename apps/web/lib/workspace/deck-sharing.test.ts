import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { shareUrl } from "./deck-sharing";

// ── handing a deck to a classmate (workstream G) ────────────────────────────────────────────
//
// 🔴🔴🔴 SHARING IS PUBLISHING, so every test here is about what a stranger holding a link can
// and cannot see. The public route runs with the SERVICE ROLE, which bypasses row level security
// entirely — what it selects is what the internet can read. There is no second line of defence
// behind it, which is why these are pinned rather than trusted.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE = strip(readFileSync(new URL("../../app/api/shared/[token]/route.ts", import.meta.url), "utf8"));
const SHARING = strip(readFileSync(new URL("./deck-sharing.ts", import.meta.url), "utf8"));
const PANEL = strip(readFileSync(new URL("../../components/workspace/library/deck-share.tsx", import.meta.url), "utf8"));
const PAGE = strip(readFileSync(new URL("../../app/shared/[token]/page.tsx", import.meta.url), "utf8"));
// 🔴 SQL COMMENTS STRIPPED TOO. The migration EXPLAINS why it has no `revoked` flag, so an
// unstripped read of it fails the very guard that rule exists to hold — a guard that reddens on
// correct code is one somebody deletes.
const MIGRATION = readFileSync(new URL("../../../../supabase/migrations/20260824T20_deck_shares.sql", import.meta.url), "utf8")
  .replace(/^\s*--.*$/gm, "");

test("🔴🔴🔴 the public route never selects anything about the sharer", () => {
  // A share says "here are some cards", never "here is who made them". `shared_by` exists on the
  // row for revocation and must never reach a response.
  const selects = ROUTE.match(/\.select\("([^"]*)"\)/g) ?? [];
  assert.ok(selects.length >= 3, "the route's queries changed shape — this guard is pointed at nothing");
  for (const select of selects) {
    assert.ok(!/shared_by|user_id|email|auth\./.test(select), `a query exposes the sharer: ${select}`);
  }
});

test("🔴🔴🔴 it hands out front and back only, never the sharer's progress", () => {
  // Due dates, repetitions, lapses and flags are a record of how the SHARER is doing. Handing
  // them to a classmate discloses something nobody agreed to share.
  assert.match(ROUTE, /\.select\("front,back"\)/, "the card query stopped being front and back only");
  assert.ok(!/due_at|repetitions|lapses|\bflag\b|interval_days/.test(ROUTE), "the shared payload carries study progress");
});

test("🔴🔴🔴 one token opens exactly one deck, and there is no way to list them", () => {
  // No search, no recent shares, no enumeration. The only way in is holding a token somebody
  // deliberately handed out.
  assert.match(ROUTE, /\.eq\("token", token\)/, "the share lookup stopped being pinned to the token");
  assert.match(ROUTE, /\.eq\("deck_id", deckId\)/, "the card query stopped being pinned to one deck");
  assert.ok(!/\.limit\(\s*\)|order\(/.test(ROUTE), "the public route grew a listing");
});

test("🔴🔴 a malformed token never reaches the database", () => {
  // Shape-checked first, so no caller-supplied string reaches a query whatever the client library
  // would have done with it.
  assert.match(ROUTE, /\^\[0-9a-f\]\{64\}\$/, "the token shape check is gone");
  const check = ROUTE.indexOf("[0-9a-f]{64}");
  const client = ROUTE.indexOf("createClient(");
  assert.ok(check > 0 && client > check, "the database client is built before the token is validated");
});

test("🔴🔴 revoked and never-existed are the same answer", () => {
  // "This link was revoked" tells a stranger the deck exists and once was public.
  const notFounds = ROUTE.match(/status: 404/g) ?? [];
  assert.ok(notFounds.length >= 3, "the route started distinguishing kinds of missing");
  assert.ok(!/revoked|disabled|expired/i.test(ROUTE), "the route tells strangers why a link is dead");
});

test("🔴🔴 revoking is a DELETE, not a flag", () => {
  // A reader that forgets to check a flag leaks. A missing row cannot be read by any query.
  assert.match(SHARING, /\.from\("deck_shares"\)\.delete\(\)/, "revoking stopped deleting the row");
  assert.ok(!/revoked|is_active|enabled/.test(SHARING), "sharing grew a flag that a reader can forget");
  assert.ok(!/revoked|is_active/.test(MIGRATION), "the table grew a flag that a reader can forget");
});

test("🔴🔴 the token is minted by the database, never by the client", () => {
  // Anything derived from the deck id, the title or a counter is enumerable, and enumerable means
  // every shared deck on the platform is readable by counting.
  assert.match(MIGRATION, /gen_random_uuid\(\)/, "the token default is gone");
  // 🔴 THE INSERT IS WHAT MATTERS, not the file. Reading `{ token: string }` back off the row is
  // exactly right; SUPPLYING one is the bug. The first version of this guard searched the whole
  // function for /token:/ and tripped on that read-back type annotation.
  const insert = SHARING.slice(SHARING.indexOf('.from("deck_shares")\n      .insert('), SHARING.indexOf(".select(\"token\")"));
  assert.ok(insert.length > 0, "the insert moved — this guard is pointed at nothing");
  assert.ok(!/token/.test(insert), "the client now supplies the token instead of letting the database mint it");
});

test("🔴 one live link per deck", () => {
  // Pressing Share twice must hand back the same link, not accumulate live tokens the learner
  // does not remember granting and cannot see to revoke.
  assert.match(MIGRATION, /unique \(deck_id\)/, "a deck can now have several live links");
  const body = SHARING.slice(SHARING.indexOf("export async function shareDeck"), SHARING.indexOf("export async function shareTokenFor"));
  assert.match(body, /const existing = await shareTokenFor/, "sharing twice mints a second token");
});

test("🔴🔴 a copy is a COPY: the taker's own, with no progress carried across", () => {
  // A shared deck that could vanish out of somebody's library mid-term makes taking one a bad
  // idea, which is the opposite of the point. And copying due dates would tell the taker they had
  // already learned things they have never seen.
  const copy = SHARING.slice(SHARING.indexOf("export async function copySharedDeck"));
  assert.match(copy, /\.from\("study_decks"\)\s*\.insert\(/, "taking a copy stopped creating a real deck");
  assert.ok(!/due_at|repetitions|lapses|interval_days/.test(copy), "the copy carries the sharer's progress");
  assert.ok(!/deck_shares/.test(copy), "the copy references the share instead of standing alone");
});

test("🔴🔴 the panel states what sharing means BEFORE it makes a link", () => {
  // Consent that was not informed is not consent.
  const explain = PANEL.indexOf("Anyone with the link");
  const button = PANEL.indexOf("Create a link");
  assert.ok(explain > 0 && button > explain, "the share button appears before the explanation");
  assert.match(PANEL, /without signing in/, "the panel stopped saying that readers need no account");
  assert.match(PANEL, /are not shared/, "the panel stopped saying what stays private");
  assert.match(PANEL, /Stopping is immediate/, "the panel stopped saying revocation is instant");
});

test("🔴🔴 the public page shows the cards without demanding a signup", () => {
  // A share that demands an account before it shows anything is a lead-capture form wearing a
  // deck's clothes, and it kills the growth channel the feature exists for.
  const signIn = PAGE.indexOf("Sign in to save these");
  const cards = PAGE.indexOf("deck.cards.map");
  assert.ok(signIn > 0 && cards > 0, "the page changed shape — this guard is pointed at nothing");
  assert.ok(!/Sign in to continue|Create an account to view/i.test(PAGE), "a sign-in wall appeared over the cards");
  assert.match(PAGE, /Sign in to save these to your own library/, "the prompt stopped saying what signing in is for");
});

test("🔴 the public page lives outside the workspace shell", () => {
  // It is for someone who has never heard of Nemesis and is not signed in. The workspace layout
  // would wrap it in a shell of controls that all require an account.
  assert.ok(existsSync(new URL("../../app/shared/[token]/page.tsx", import.meta.url)));
  assert.ok(!existsSync(new URL("../../app/(workspace)/shared", import.meta.url)), "the shared page moved inside the workspace shell");
});

test("share links are built from the origin the learner is actually on", () => {
  assert.equal(shareUrl("abc", "https://app.enternemesis.com"), "https://app.enternemesis.com/shared/abc");
  assert.equal(shareUrl("abc", "https://app.enternemesis.com/"), "https://app.enternemesis.com/shared/abc");
});
