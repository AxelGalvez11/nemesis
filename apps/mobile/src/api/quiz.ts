/**
 * The active recall quiz (canvas: QuizRecall, QuizChoice, QuizMatch), following Gizmo's Memorise
 * (memory: gizmo-quiz-teardown): each card asked as 4 options, the 3 wrong answers written by AI ONCE and
 * kept on the card (study_cards.payload.quiz), instant green or red, missed cards back at the end of the round.
 *
 * 🔴 THE RIGHT ANSWER IS ALWAYS THE CARD'S OWN BACK. The model only writes wrong options and a one-line
 * explanation, so a quiz can never teach something the card does not say.
 * 🔴 WRONG OPTIONS ARE NEVER OTHER CARDS' ANSWERS when the model is reachable (Gizmo's rule: same kind of
 * answer, written for this card). Other cards' answers are only the offline fallback, and are not saved.
 */
import { completeOnce } from './chat';
import { cardQuiz, saveCardQuiz, type Card, type CardQuiz } from './study';

export type ChoiceQuestion = {
  kind: 'choice';
  card: Card;
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
  /** Set on a card coming back at the end of the round. */
  retry?: boolean;
};

export type MatchRound = {
  kind: 'match';
  pairs: { cardId: string; left: string; right: string }[];
};

export type QuizItem = ChoiceQuestion | MatchRound;

export const ROUND_SIZE = 8;
const MATCH_SIZE = 4;

function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function clip(text: string, max = 160): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function distractorMessages(cards: Card[]) {
  const list = cards.map((c) => ({ id: c.id, question: clip(c.front, 400), answer: clip(c.back, 400) }));
  return [
    {
      role: 'system' as const,
      content:
        "You write multiple-choice options for a student's own flashcards, in any subject. " +
        'For each card, write exactly 3 WRONG answers of the same kind as the correct one: plausible to someone who half-remembers, ' +
        'similar in length and style, and clearly wrong to someone who knows it. Never repeat or paraphrase the correct answer, ' +
        'and never use another card\'s answer. Also write "explain": one sentence on why the correct answer is right, using only what the card says. ' +
        'Reply with JSON only: [{"id": "...", "wrong": ["...","...","..."], "explain": "..."}].',
    },
    { role: 'user' as const, content: JSON.stringify(list) },
  ];
}

function parseDistractors(text: string): Map<string, CardQuiz> {
  const out = new Map<string, CardQuiz>();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return out;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(raw)) return out;
    for (const r of raw) {
      const o = r as { id?: unknown; wrong?: unknown; explain?: unknown };
      if (typeof o.id !== 'string' || !Array.isArray(o.wrong)) continue;
      const wrong = o.wrong.filter((w): w is string => typeof w === 'string' && w.trim().length > 0).map((w) => clip(w));
      if (wrong.length >= 3) out.set(o.id, { wrong: wrong.slice(0, 3), explain: typeof o.explain === 'string' ? o.explain : undefined });
    }
  } catch {
    // unparseable reply: the caller falls back
  }
  return out;
}

/** Makes sure each card has its three wrong answers, writing the missing ones in one call and saving them on the cards. */
async function ensureOptions(uid: string, cards: Card[]): Promise<Map<string, CardQuiz>> {
  const have = new Map<string, CardQuiz>();
  const missing: Card[] = [];
  for (const c of cards) {
    const q = cardQuiz(c);
    if (q) have.set(c.id, q);
    else missing.push(c);
  }
  if (missing.length === 0) return have;
  const text = await completeOnce(uid, distractorMessages(missing)).catch(() => null);
  if (!text) return have;
  const written = parseDistractors(text);
  await Promise.all(
    missing.map(async (c) => {
      const q = written.get(c.id);
      if (!q) return;
      have.set(c.id, q);
      await saveCardQuiz(c, q).catch(() => undefined);
    }),
  );
  return have;
}

export function choiceFor(card: Card, quiz: CardQuiz | undefined, pool: Card[], retry = false): ChoiceQuestion | null {
  const right = clip(card.back);
  const wrong = quiz?.wrong ?? shuffle(pool.filter((c) => c.id !== card.id).map((c) => clip(c.back))).slice(0, 3);
  if (wrong.length < 1) return null;
  const options = shuffle([right, ...wrong]);
  return { kind: 'choice', card, prompt: card.front, options, answer: options.indexOf(right), explain: quiz?.explain ?? card.back, retry };
}

/**
 * One round: up to ROUND_SIZE cards, due cards first, asked as options, with a matching round after the
 * third question when the set has at least three cards.
 */
export async function buildRound(uid: string, cards: Card[], now = Date.now()): Promise<{ items: QuizItem[]; options: Map<string, CardQuiz> }> {
  const live = cards.filter((c) => !c.suspended && c.front.trim() && c.back.trim());
  if (live.length === 0) return { items: [], options: new Map() };
  const due = shuffle(live.filter((c) => new Date(c.due_at).getTime() <= now));
  const rest = shuffle(live.filter((c) => new Date(c.due_at).getTime() > now));
  const picked = [...due, ...rest].slice(0, ROUND_SIZE);
  const options = await ensureOptions(uid, picked);

  const items: QuizItem[] = picked.flatMap((card) => {
    const q = choiceFor(card, options.get(card.id), live);
    return q ? [q] : [];
  });
  if (live.length >= 3) {
    const pairs = shuffle(live).slice(0, MATCH_SIZE).map((c) => ({ cardId: c.id, left: clip(c.front, 90), right: clip(c.back, 90) }));
    items.splice(Math.min(3, items.length), 0, { kind: 'match', pairs });
  }
  return { items, options };
}
