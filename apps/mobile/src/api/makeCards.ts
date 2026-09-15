/**
 * "Make flashcards" on a page's Create tab (canvas: NoteCreate, CreateSources): Nemesis writes a set of
 * cards from the page's own notes and the sources the student ticked, and files the set under the page.
 *
 * 🔴 NEMESIS PICKS THE COUNT (owner removed the "How many" control). The model is told to cover what matters
 *    and stop, within a ceiling that keeps one call affordable.
 * 🔴 CARDS ONLY SAY WHAT THE MATERIAL SAYS. Each card must be answerable from the text it was given; nothing
 *    from general knowledge. The same field-agnostic rule as every prompt in Nemesis: no subject keywords.
 */
import { completeOnce } from './chat';
import { loadPage, pageBlocks } from './space';
import { addCard, createDeck } from './study';
import { supabase } from './supabase';

export type SourceBody = { id: string; name: string; mime: string | null; body: string };

const MAX_CARDS = 30;
const MAX_INPUT_CHARS = 60_000;

export async function sourceBodies(pageId: string, ids: string[] | null = null): Promise<SourceBody[]> {
  const { data, error } = await supabase.rpc('ws_source_bodies', { p_page: pageId, p_ids: ids });
  if (error) throw new Error(`ws_source_bodies: ${error.message}`);
  return ((data as SourceBody[] | null) ?? []).filter((s) => typeof s.body === 'string' && s.body.trim());
}

/** The page's own notes as plain text, headings and lists kept readable. */
export async function pageText(pageId: string): Promise<{ title: string; text: string }> {
  const loaded = await loadPage(pageId);
  const lines = pageBlocks(loaded).map((b) => {
    const pad = '  '.repeat(b.depth);
    if (b.type === 'header' || b.type === 'sub_header' || b.type === 'sub_sub_header') return `\n${b.text}`;
    if (b.type === 'bulleted_list' || b.type === 'numbered_list' || b.type === 'to_do') return `${pad}- ${b.text}`;
    if (b.type === 'transcription') return b.transcript ? `Recording transcript: ${b.transcript}` : '';
    return `${pad}${b.text}`;
  });
  return { title: String(loaded.page.props.title ?? ''), text: lines.filter((l) => l.trim()).join('\n') };
}

function cardMessages(title: string, material: string) {
  return [
    {
      role: 'system' as const,
      content:
        "You write flashcards from a student's own study material, in any subject. " +
        `Write as many cards as the material needs to cover what matters, and no more than ${MAX_CARDS}. ` +
        'Each card tests one idea. The front is a clear question or prompt; the back is a short, complete answer. ' +
        'Every answer must be supported by the material given; do not add facts from general knowledge. ' +
        'Skip page furniture (dates, headings on their own, to-do items). ' +
        'Reply with JSON only: [{"front": "...", "back": "..."}].',
    },
    { role: 'user' as const, content: `Title: ${title || 'Untitled'}\n\n${material.slice(0, MAX_INPUT_CHARS)}` },
  ];
}

function parseCards(text: string): { front: string; back: string }[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .flatMap((r) => {
        const o = r as { front?: unknown; back?: unknown };
        return typeof o.front === 'string' && typeof o.back === 'string' && o.front.trim() && o.back.trim()
          ? [{ front: o.front.trim(), back: o.back.trim() }]
          : [];
      })
      .slice(0, MAX_CARDS);
  } catch {
    return [];
  }
}

/**
 * Writes a set from the page notes (when `includeNotes`) and the chosen sources, saves it under the page,
 * and returns the new deck id and how many cards it holds.
 */
export async function makeFlashcards(
  uid: string,
  pageId: string,
  opts: { includeNotes: boolean; sourceIds: string[] },
): Promise<{ deckId: string; count: number }> {
  const parts: string[] = [];
  const page = await pageText(pageId);
  if (opts.includeNotes && page.text.trim()) parts.push(`Notes on this page:\n${page.text}`);
  if (opts.sourceIds.length) {
    const bodies = await sourceBodies(pageId, opts.sourceIds);
    for (const s of bodies) parts.push(`Source "${s.name}":\n${s.body}`);
  }
  const material = parts.join('\n\n---\n\n');
  if (!material.trim()) throw new Error('There is nothing to make flashcards from yet. Write some notes or add a source first.');

  const reply = await completeOnce(uid, cardMessages(page.title, material));
  const cards = reply ? parseCards(reply) : [];
  if (cards.length === 0) throw new Error('Nemesis could not write cards this time. Try again in a moment.');

  const deckId = await createDeck(page.title || 'Flashcards', pageId);
  for (const card of cards) await addCard(deckId, card.front, card.back);
  return { deckId, count: cards.length };
}
