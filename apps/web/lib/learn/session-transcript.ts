// What actually happened in this session, reconstructed from the durable evidence log.
//
// 🔴 THE CANVAS IS TRANSIENT AND THAT IS THE DESIGN, BUT THE RECORD MUST NOT BE. The teaching
// surface shows one cognitive object and lets the rest go quiet — a permanent chat log occupying
// the page is the thing the whole surface is built to avoid. That is a rule about ATTENTION, not
// about memory. A learner who wants to look back at what they said two hours ago is asking a
// reasonable question, and "the interface is calm" is not an answer to it.
//
// 🔴 IT READS `learner_evidence`, NOT `canvas-events.ts`. That file says so itself: it is a capped
// ring buffer that "drops the oldest rows when it fills", telemetry for interpreting evidence
// rather than a history anything may be reconstructed from. Building a transcript on it would
// silently lose the beginning of every long session, which is exactly the part worth looking at.
// The evidence log is append-only and already carries everything needed: the learner's own words,
// how they produced them, when, and what the judge concluded.
//
// 🔴 AND IT IS A LEARNING RECORD, NOT A CHAT LOG. What it shows is what the learner DID and what
// it established — not a replay of every message. The prompt text is deliberately not stored on
// evidence rows (the objective is), so an entry reads "you explained X, in your own words, and it
// showed Y" rather than pretending to be a conversation transcript it never had the data for.

import type { EvidenceVerdict, LearnerEvidence } from "./learner-evidence";
import type { LearnerInputModality } from "./canvas-model";

export interface TranscriptEntry {
  id: string;
  occurredAt: string;
  /** The concept this was about, in the learner's own material's words. */
  objective: string;
  /** What the learner produced, when it was retained. */
  said: string | null;
  /** How they produced it. */
  via: LearnerInputModality | null;
  /**
   * What it established. 🔴 NULL IS A REAL, DIFFERENT ANSWER — an opportunity happened and nothing
   * was concluded, which is not the same as doing badly.
   */
  verdict: EvidenceVerdict | null;
  /** Nothing usable came back: revealed, gave up, or unreadable. */
  nothingProduced: boolean;
}

/** How the entry reads to a learner. Deliberately flat, plain, and never congratulatory. */
export function entrySummary(entry: TranscriptEntry): string {
  if (entry.nothingProduced) return "No answer came back on this one.";
  if (!entry.verdict) return "Answered. Nothing was concluded from it.";
  if (entry.verdict === "strong") return "Answered in full.";
  if (entry.verdict === "understood") return "Answered.";
  if (entry.verdict === "partial") return "Partly answered.";
  if (entry.verdict === "misconception") return "Answered, and it showed a specific wrong belief.";
  return "Missed.";
}

/**
 * Build the session record, newest first.
 *
 * `label` resolves an objective's identity key to something a person recognises. When it cannot —
 * an objective from a source since detached, say — the entry is still shown with its key, because
 * dropping rows would make the record quietly incomplete, which is worse than an ugly line.
 */
export function buildTranscript(
  evidence: readonly LearnerEvidence[],
  label: (identityKey: string) => string | null,
): TranscriptEntry[] {
  return [...evidence]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((row) => ({
      id: row.id,
      nothingProduced: !row.demonstrationObtained,
      objective: label(row.objectiveIdentityKey) ?? row.objectiveIdentityKey,
      occurredAt: row.occurredAt,
      said: row.responseText ?? null,
      verdict: row.verdict,
      via: row.responseModality ?? null,
    }));
}

/**
 * Group entries by calendar day, newest day first, for a record that spans sessions.
 *
 * 🔴 BY THE LEARNER'S OWN DAY, VIA `toLocaleDateString`, NOT BY UTC. Somebody revising at 11pm and
 * again at 1am has studied on two days by the clock they live in, and a UTC bucket would either
 * merge them or split a single evening in half depending on which side of the world they are on.
 */
export function groupByDay(
  entries: readonly TranscriptEntry[],
  locale?: string,
): { day: string; entries: TranscriptEntry[] }[] {
  const days: { day: string; entries: TranscriptEntry[] }[] = [];
  for (const entry of entries) {
    const when = new Date(entry.occurredAt);
    const day = Number.isNaN(when.getTime())
      ? "Unknown"
      : when.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
    const open = days.at(-1);
    if (open && open.day === day) open.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  return days;
}
