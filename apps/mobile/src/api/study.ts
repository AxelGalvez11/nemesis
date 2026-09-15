/**
 * Flashcard sets for the rebuilt Study tab: decks filed by the page they were made in
 * (study_decks.page_id, added by the space_home migration), their cards, what is due,
 * and grading through the same FSRS-6 RPC the web uses.
 *
 * 🔴 THE DUE RULE IS THE WEB'S RULE (apps/web/lib/space/due-cards.ts): due now, OR in a learning /
 * relearning step and due inside Anki's 20-minute learn-ahead window. Two rules would make the
 * Study tab promise a number the review screen does not show.
 *
 * 🔴 X AND CHECK ONLY. The design has no Again/Hard/Good/Easy buttons; X grades `again`, check grades `good`.
 */
import { supabase } from './supabase';

export const LEARN_AHEAD_MINUTES = 20;
const STEP_STATES = ['learning', 'relearning'];

export type Deck = { id: string; name: string; page_id: string | null; updated_at: string | null; cards: number; due: number };

export type Card = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  due_at: string;
  state: string | null;
  suspended: boolean;
  /** Free-form per-card data. Image occlusion lives here; the quiz keeps its written options under `quiz`. */
  payload?: Record<string, unknown> | null;
};

/** What the quiz keeps on a card: three wrong answers written once (Gizmo keeps them on the card too). */
export type CardQuiz = { wrong: string[]; explain?: string };

export function cardQuiz(card: Pick<Card, 'payload'>): CardQuiz | null {
  const q = (card.payload as { quiz?: unknown } | null | undefined)?.quiz as { wrong?: unknown; explain?: unknown } | undefined;
  if (!q || !Array.isArray(q.wrong)) return null;
  const wrong = q.wrong.filter((w): w is string => typeof w === 'string' && w.trim().length > 0);
  return wrong.length >= 3 ? { wrong: wrong.slice(0, 3), explain: typeof q.explain === 'string' ? q.explain : undefined } : null;
}

/** Saves the quiz options onto the card, MERGED into its payload so occlusion data on the same card survives. */
export async function saveCardQuiz(card: Pick<Card, 'id' | 'payload'>, quiz: CardQuiz): Promise<void> {
  const payload = { ...(card.payload ?? {}), quiz };
  const { error } = await supabase.from('study_cards').update({ payload }).eq('id', card.id);
  if (error) throw new Error(`study_cards: ${error.message}`);
}

async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export function isDue(card: Pick<Card, 'due_at' | 'state' | 'suspended'>, now = Date.now()): boolean {
  if (card.suspended) return false;
  const at = new Date(card.due_at).getTime();
  if (!Number.isFinite(at)) return false;
  if (at <= now) return true;
  return STEP_STATES.includes(card.state ?? '') && at <= now + LEARN_AHEAD_MINUTES * 60_000;
}

/** Every deck with its card and due counts. Cards are read once (id, deck, due, state) and counted here. */
export async function listDecks(): Promise<Deck[]> {
  const uid = await userId();
  if (!uid) return [];
  const { data: decks, error } = await supabase
    .from('study_decks')
    .select('id,name,page_id,updated_at')
    .eq('user_id', uid)
    // Only sets made from a page's Create tab. Old decks have no page and are not shown (lib/fresh.ts).
    .not('page_id', 'is', null)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`study_decks: ${error.message}`);
  const counts = new Map<string, { cards: number; due: number }>();
  const now = Date.now();
  for (let from = 0; ; from += 1000) {
    const { data: rows, error: e2 } = await supabase
      .from('study_cards')
      .select('deck_id,due_at,state,suspended')
      .eq('user_id', uid)
      .range(from, from + 999);
    if (e2) throw new Error(`study_cards: ${e2.message}`);
    for (const r of rows ?? []) {
      const c = counts.get(r.deck_id) ?? { cards: 0, due: 0 };
      c.cards += 1;
      if (isDue(r as Card, now)) c.due += 1;
      counts.set(r.deck_id, c);
    }
    if (!rows || rows.length < 1000) break;
  }
  return (decks ?? []).map((d) => ({ ...d, cards: counts.get(d.id)?.cards ?? 0, due: counts.get(d.id)?.due ?? 0 }));
}

export async function deckCards(deckId: string): Promise<Card[]> {
  const { data, error } = await supabase
    .from('study_cards')
    .select('id,deck_id,front,back,due_at,state,suspended,payload')
    .eq('deck_id', deckId)
    .order('due_at', { ascending: true });
  if (error) throw new Error(`study_cards: ${error.message}`);
  return (data ?? []) as Card[];
}

/** Today's queue for a deck: step cards first, then the longest-waiting. Nothing due → the whole deck, so a set can always be studied. */
export function reviewQueue(cards: Card[], now = Date.now(), newLimit = Infinity): Card[] {
  const live = cards.filter((c) => !c.suspended);
  let fresh = 0;
  const due = live
    .filter((c) => isDue(c, now))
    .sort((a, b) => Number(STEP_STATES.includes(b.state ?? '')) - Number(STEP_STATES.includes(a.state ?? '')) || a.due_at.localeCompare(b.due_at))
    // New cards per day (Study settings): never-studied cards join up to the limit; reviews always join.
    .filter((c) => c.state !== 'new' || fresh++ < newLimit);
  return due.length ? due : live;
}

// ── Authoring, only from a page's Create tab ─────────────────────────────────────────────────────
// 🔴 Owner, 2026-09-14: "Students can type cards too" in Create (add, edit, delete, like Gizmo).
// Study screens (flip, quiz) stay free of editors; these functions are for Create only.

/** A new empty set filed under the page it was made in. */
export async function createDeck(name: string, pageId: string | null): Promise<string> {
  const uid = await userId();
  if (!uid) throw new Error('Sign in to make flashcards.');
  const { data, error } = await supabase
    .from('study_decks')
    .insert({ user_id: uid, name: name.trim() || 'Flashcards', page_id: pageId })
    .select('id')
    .single();
  if (error) throw new Error(`study_decks: ${error.message}`);
  return data.id as string;
}

export async function addCard(deckId: string, front: string, back: string): Promise<Card> {
  const uid = await userId();
  if (!uid) throw new Error('Sign in to add cards.');
  const { data, error } = await supabase
    .from('study_cards')
    .insert({ user_id: uid, deck_id: deckId, front: front.trim(), back: back.trim(), due_at: new Date().toISOString() })
    .select('id,deck_id,front,back,due_at,state,suspended')
    .single();
  if (error) throw new Error(`study_cards: ${error.message}`);
  return data as Card;
}

/**
 * 🔴 AN EDITED CARD DROPS ITS SAVED QUIZ OPTIONS. Three wrong answers written for the old front and back
 * would sit next to a new right answer (or be right themselves), so they are cleared and rewritten on the
 * next quiz. Everything else in the payload (image occlusion) is kept.
 */
export async function updateCard(cardId: string, front: string, back: string): Promise<void> {
  const { data: current, error: readError } = await supabase.from('study_cards').select('payload').eq('id', cardId).maybeSingle();
  if (readError) throw new Error(`study_cards: ${readError.message}`);
  const payload = { ...((current?.payload as Record<string, unknown> | null) ?? {}) };
  delete payload.quiz;
  const { error } = await supabase
    .from('study_cards')
    .update({ front: front.trim(), back: back.trim(), payload: Object.keys(payload).length ? payload : null })
    .eq('id', cardId);
  if (error) throw new Error(`study_cards: ${error.message}`);
}

/** Deleting a card also removes its review history (the schema cascades), so the caller confirms first. */
export async function deleteCard(cardId: string): Promise<void> {
  const { error } = await supabase.from('study_cards').delete().eq('id', cardId);
  if (error) throw new Error(`study_cards: ${error.message}`);
}

export async function markCard(cardId: string, got: boolean, durationMs?: number): Promise<void> {
  const { error } = await supabase.rpc('grade_study_card', {
    p_card_id: cardId,
    p_grade: got ? 'good' : 'again',
    p_duration_ms: durationMs ?? null,
  });
  if (error) throw new Error(`grade_study_card: ${error.message}`);
}
