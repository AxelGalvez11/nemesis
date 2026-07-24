// The daily note: what the student actually did today, written from their data.
//
// EVERY NUMBER IN THIS NOTE IS COMPUTED HERE, IN CODE. The model is allowed to add
// a sentence of encouragement or a suggestion for tomorrow, but it never produces
// the counts — a study log that says "you reviewed about 40 cards" when the real
// figure is 12 is worse than no log at all, because the student will believe it and
// plan around it. This is the same rule the performance reader follows.
//
// A day is bounded in the STUDENT'S LOCAL TIME, not UTC. A card reviewed at 9pm in
// Chicago is on 2026-07-24 for them and 2026-07-25 in UTC, and a study log that
// files evening work under tomorrow is wrong in the way people notice first.
//
// Pure: rows in, markdown out. The queries live in agent-tools.ts.

/** Grades the study reviewer records. "again" is the only failure. */
const PASS_GRADES = new Set(["hard", "good", "easy"]);

export interface DayReviewRow {
  card_id: string;
  grade: string;
  reviewed_at: string;
}

export interface DayDeckRow {
  id: string;
  name: string;
}

export interface DayCardRow {
  id: string;
  deck_id: string;
}

export interface DayRecordingRow {
  title: string | null;
  created_at: string;
  /** Seconds of audio, when the recorder stored a duration. */
  duration_seconds?: number | null;
}

export interface DayEventRow {
  title: string;
  date: string;
  kind: string;
  time?: string | null;
}

export interface DayNoteRow {
  title: string;
  path: string;
  updated_at: string;
}

export interface DailyNoteInput {
  /** The local day being summarised, YYYY-MM-DD. */
  day: string;
  reviews: readonly DayReviewRow[];
  cards: readonly DayCardRow[];
  decks: readonly DayDeckRow[];
  recordings: readonly DayRecordingRow[];
  /** Events dated on `day`. */
  events: readonly DayEventRow[];
  /** Notes created or edited on `day`. */
  notes: readonly DayNoteRow[];
}

export interface DeckReviewCount {
  deck: string;
  reviewed: number;
  again: number;
}

export interface DailySummary {
  day: string;
  cardsReviewed: number;
  /** Distinct cards, which is smaller than cardsReviewed when a card was seen twice. */
  uniqueCards: number;
  passed: number;
  again: number;
  /** Share of reviews passed, 0-100, or null when nothing was reviewed. NEVER 0 for
   *  "no reviews" — a zero score reads as total failure. */
  passRatePct: number | null;
  byDeck: DeckReviewCount[];
  recordings: number;
  recordedMinutes: number;
  events: readonly DayEventRow[];
  notesTouched: readonly DayNoteRow[];
  /** True when the student did nothing we can see. */
  quiet: boolean;
}

/** Local-day key (YYYY-MM-DD) for a timestamp, in the runtime's own timezone. */
export function localDayKey(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Reduce one day's raw rows to the numbers the note reports. PURE. */
export function summarizeDay(input: DailyNoteInput): DailySummary {
  const deckOfCard = new Map(input.cards.map((card) => [card.id, card.deck_id]));
  const deckName = new Map(input.decks.map((deck) => [deck.id, deck.name]));

  const onDay = input.reviews.filter((row) => localDayKey(row.reviewed_at) === input.day);
  const perDeck = new Map<string, DeckReviewCount>();
  let passed = 0;
  let again = 0;

  for (const row of onDay) {
    const isPass = PASS_GRADES.has(row.grade.toLowerCase());
    if (isPass) passed += 1;
    else again += 1;

    const deckId = deckOfCard.get(row.card_id);
    const name = (deckId && deckName.get(deckId)) || "Other cards";
    const entry = perDeck.get(name) ?? { again: 0, deck: name, reviewed: 0 };
    entry.reviewed += 1;
    if (!isPass) entry.again += 1;
    perDeck.set(name, entry);
  }

  const recordings = input.recordings.filter((row) => localDayKey(row.created_at) === input.day);
  const recordedSeconds = recordings.reduce((sum, row) => sum + Math.max(0, row.duration_seconds ?? 0), 0);
  const notesTouched = input.notes.filter((row) => localDayKey(row.updated_at) === input.day);

  return {
    again,
    byDeck: [...perDeck.values()].sort((a, b) => b.reviewed - a.reviewed),
    cardsReviewed: onDay.length,
    day: input.day,
    events: input.events.filter((row) => row.date === input.day),
    notesTouched,
    passed,
    // null, not 0: "no reviews" and "failed everything" must not read the same.
    passRatePct: onDay.length === 0 ? null : Math.round((passed / onDay.length) * 100),
    quiet: onDay.length === 0 && recordings.length === 0 && notesTouched.length === 0,
    recordedMinutes: Math.round(recordedSeconds / 60),
    recordings: recordings.length,
    uniqueCards: new Set(onDay.map((row) => row.card_id)).size,
  };
}

/** The markdown body of the daily note. PURE — no model involved. */
export function buildDailyNote(summary: DailySummary): string {
  const lines: string[] = [`# ${formatDay(summary.day)}`, ""];

  if (summary.quiet) {
    lines.push("No study activity recorded today.", "");
  }

  if (summary.cardsReviewed > 0) {
    lines.push("## Flashcards", "");
    lines.push(
      `- ${plural(summary.cardsReviewed, "review", "reviews")} across ${plural(summary.uniqueCards, "card", "cards")}`,
    );
    lines.push(`- ${summary.passed} passed, ${summary.again} marked again (${summary.passRatePct}% pass rate)`);
    for (const deck of summary.byDeck) {
      const struggled = deck.again > 0 ? ` — ${deck.again} needing another look` : "";
      lines.push(`- **${deck.deck}**: ${plural(deck.reviewed, "review", "reviews")}${struggled}`);
    }
    lines.push("");
  }

  if (summary.recordings > 0) {
    lines.push("## Lectures recorded", "");
    const minutes = summary.recordedMinutes > 0 ? ` (${plural(summary.recordedMinutes, "minute", "minutes")})` : "";
    lines.push(`- ${plural(summary.recordings, "recording", "recordings")}${minutes}`);
    lines.push("");
  }

  if (summary.notesTouched.length > 0) {
    lines.push("## Notes worked on", "");
    for (const note of summary.notesTouched) lines.push(`- [[${note.title}]]`);
    lines.push("");
  }

  if (summary.events.length > 0) {
    lines.push("## On the calendar", "");
    for (const event of summary.events) {
      lines.push(`- ${event.time ? `${event.time} — ` : ""}${event.title} (${event.kind})`);
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** The note's path. One note per day, so re-running updates rather than piling up. */
export function dailyNotePath(day: string): string {
  return `Daily/${day}.md`;
}

function formatDay(day: string): string {
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "long", weekday: "long", year: "numeric" });
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
