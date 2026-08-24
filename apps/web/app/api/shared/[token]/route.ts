// The one place a private deck becomes readable without signing in.
//
// Owner's build order, workstream G. A learner shares a deck; a classmate opens the link,
// studies it, and can copy it into their own library.
//
// 🔴🔴🔴 THIS ROUTE IS THE ENTIRE PUBLIC SURFACE OF SOMEBODY'S PRIVATE DATA, and every line
// below is written on that assumption. It runs with the service role, which bypasses RLS
// completely — so what it selects IS what the internet can see. The rules it follows:
//
//   1. A token, or nothing. No listing, no search, no "recent shares". The only way in is
//      holding a 256-bit token somebody deliberately handed out.
//   2. One deck. The share row names exactly one deck_id and the queries are pinned to it;
//      there is no path here that can widen to "and their other decks".
//   3. Nothing about the sharer. Not their name, not their email, not their user id. A
//      share says "here are some cards", never "here is who made them". `shared_by` exists
//      on the row for revocation and is never selected into a response.
//   4. Nothing about the learner's progress. Due dates, lapses, repetitions and flags are a
//      record of how somebody is doing, and that is not part of the cards. Front and back
//      only.
//
// 🔴 A MISSING SHARE AND A REVOKED SHARE ARE THE SAME 404, deliberately. "This link was
// revoked" tells a stranger that the deck exists and once was public, which is more than a
// revoked link should ever say.

import { createClient } from "@supabase/supabase-js";

import { serviceRoleKey, supabaseUrl } from "@/lib/env";

/** The most cards a shared deck hands out. A deck beyond this is a corpus, not a study aid. */
const MAX_CARDS = 2000;

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  // 🔴 SHAPE-CHECKED BEFORE IT REACHES THE DATABASE. The token is two uuids with the dashes
  // stripped: 64 hex characters, nothing else. Rejecting anything else here means no
  // caller-supplied string ever reaches a query, whatever the client library would have
  // done with it.
  if (!/^[0-9a-f]{64}$/.test(token)) return Response.json({ error: "Not found." }, { status: 404 });
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: "Not found." }, { status: 404 });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: share, error: shareError } = await admin
    .from("deck_shares")
    .select("deck_id")
    .eq("token", token)
    .maybeSingle();
  // A revoked share is a deleted row, so this is the same answer as a token nobody ever minted.
  if (shareError || !share) return Response.json({ error: "Not found." }, { status: 404 });

  const deckId = (share as { deck_id: string }).deck_id;

  const { data: deck } = await admin.from("study_decks").select("name").eq("id", deckId).maybeSingle();
  const { data: cards } = await admin
    // 🔴 FRONT AND BACK ONLY. Not due_at, not repetitions, not lapses, not flag: those are a
    // record of how the SHARER is doing, and handing them to a classmate discloses something
    // nobody agreed to share.
    .from("study_cards")
    .select("front,back")
    .eq("deck_id", deckId)
    .eq("suspended", false)
    .limit(MAX_CARDS);

  return Response.json({
    cards: (cards ?? []) as { front: string; back: string }[],
    name: (deck as { name?: string } | null)?.name?.split("::").at(-1) ?? "Shared deck",
  });
}
