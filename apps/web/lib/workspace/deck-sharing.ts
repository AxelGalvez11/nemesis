// Handing a deck to a classmate, and taking it back.
//
// Owner's build order, workstream G: *"A deck or a course gets a link. Someone opens it, studies
// it, and can copy it into their own library. That is the cheapest growth a learning app gets:
// one student in a class can mean the class."*
//
// 🔴🔴 SHARING IS PUBLISHING, AND THIS MODULE NEVER DOES IT BY ACCIDENT. A share exists only
// because a learner pressed Share on one named deck. There is no "share on create", no default
// visibility, and no bulk action — every public link in this product traces to one deliberate
// press on one deck.
//
// 🔴 THE TOKEN IS MINTED BY THE DATABASE, NEVER HERE. `deck_shares.token` defaults to two random
// uuids; a client-chosen token is a client-chosen guess, and anything derived from the deck id or
// the title is enumerable — which would make every shared deck on the platform readable by
// counting. This module inserts a row and reads back what the database chose.
//
// 🔴 REVOKING DELETES THE ROW. Not a flag: a reader that forgets to check a flag leaks, and a
// missing row cannot be read by any query anyone will ever write.
//
// 🔴 EVERY CALL IS BEST-EFFORT. The table ships behind an owner-applied migration, so until it
// runs, sharing reports "not available" and nothing else in the Library changes.

import { supabase } from "@/lib/supabase";

/** A deck as a stranger holding the link sees it: cards, and a name. Nothing about the sharer. */
export interface SharedDeck {
  readonly name: string;
  readonly cards: readonly { front: string; back: string }[];
}

/** The public URL for a token, built from the window the learner is actually on. */
export function shareUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/shared/${token}`;
}

/**
 * Share a deck, or return the link it already has.
 *
 * 🔴 ONE LIVE LINK PER DECK, ENFORCED BY A UNIQUE CONSTRAINT AND HONOURED HERE. Pressing Share
 * twice must hand back the same link rather than accumulating a trail of live tokens the learner
 * does not remember granting and cannot see to revoke.
 */
export async function shareDeck(uid: string | null, deckId: string): Promise<string | null> {
  if (!uid) return null;
  try {
    const existing = await shareTokenFor(uid, deckId);
    if (existing) return existing;
    const { data, error } = await supabase
      .from("deck_shares")
      .insert({ deck_id: deckId, shared_by: uid })
      .select("token")
      .maybeSingle();
    if (error || !data) return null;
    return (data as { token: string }).token;
  } catch {
    return null;
  }
}

/** The live token for this learner's deck, or null when it is not shared. */
export async function shareTokenFor(uid: string | null, deckId: string): Promise<string | null> {
  if (!uid) return null;
  try {
    const { data, error } = await supabase
      .from("deck_shares")
      .select("token")
      .eq("deck_id", deckId)
      .eq("shared_by", uid)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { token: string }).token;
  } catch {
    return null;
  }
}

/** Stop sharing. The link stops working for everyone, immediately and permanently. */
export async function revokeShare(uid: string | null, deckId: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const { error } = await supabase.from("deck_shares").delete().eq("deck_id", deckId).eq("shared_by", uid);
    return !error;
  } catch {
    return false;
  }
}

/** Read a shared deck. No sign-in required — this is the public route. */
export async function loadSharedDeck(token: string): Promise<SharedDeck | null> {
  try {
    const res = await fetch(`/api/shared/${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { name?: string; cards?: { front: string; back: string }[] };
    if (!Array.isArray(body.cards)) return null;
    return { cards: body.cards, name: typeof body.name === "string" ? body.name : "Shared deck" };
  } catch {
    return null;
  }
}

/**
 * Take a copy.
 *
 * 🔴🔴 A COPY, NOT A REFERENCE, AND THAT IS THE WHOLE SEMANTICS OF THIS FEATURE. The new deck is
 * the taker's own: their scheduling, their progress, and it keeps working after the sharer
 * revokes the link or deletes their original. A shared deck that could vanish out of somebody's
 * library mid-term would make taking one a bad idea, which is the opposite of the point.
 *
 * 🔴 AND IT CARRIES NO PROGRESS ACROSS. New cards start new. Copying the sharer's due dates would
 * tell the taker they had already learned things they have never seen.
 */
export async function copySharedDeck(uid: string | null, deck: SharedDeck): Promise<string | null> {
  if (!uid || deck.cards.length === 0) return null;
  try {
    const { data, error } = await supabase
      .from("study_decks")
      .insert({ description: "Copied from a shared link.", name: deck.name.slice(0, 120), user_id: uid })
      .select("id")
      .maybeSingle();
    if (error || !data) return null;
    const deckId = (data as { id: string }).id;
    const rows = deck.cards.map((card) => ({
      back: card.back,
      card_type: "basic",
      deck_id: deckId,
      front: card.front,
      user_id: uid,
    }));
    const { error: cardError } = await supabase.from("study_cards").insert(rows);
    if (cardError) return null;
    return deckId;
  } catch {
    return null;
  }
}
