// Pure logic for naming and describing a saved recording (owner item 3,
// 2026-07-23). Two jobs, both dependency-free and node:test-able:
//   1. The AI title — build the prompt that asks the cheap conversational
//      model for a short human name, then clean whatever it replies into a
//      card headline (or null so the caller keeps its timestamp fallback).
//   2. The spoken duration — the card's subline reads "Recorded 25 minutes"
//      instead of the terse "25 min · Jul 23".
// The network call and the artifact rename live in recording-artifacts.ts
// ("use client"); this file mirrors the live-audio-contract.ts split so its
// tests never have to load the browser transport. The WireMsg import is
// type-only and erased at compile, so importing this module pulls in nothing
// from chat-api.ts.

import type { WireMsg } from "@/lib/workspace/chat-api";

/** Longest AI title we keep. Past this it's a sentence, not a name — the
 *  prompt asks for a few words, and cleanRecordingTitle caps as a backstop. */
export const RECORDING_TITLE_MAX_CHARS = 60;

/** How much of the transcript the namer sees. A lecture states its topic in
 *  the opening minutes, so the HEAD (not the tail the live-notes pass reads)
 *  is what names it best, and a short slice keeps this metered call cheap. */
export const RECORDING_TITLE_TRANSCRIPT_CHARS = 2_000;

/** How much of the notes we hand the namer as a hint — a couple of bullets is
 *  plenty of extra signal without doubling the prompt. */
const RECORDING_TITLE_NOTES_CHARS = 400;

/** The chat/completions messages that ask for a recording's title. Routed by
 *  the caller through the same conversational slot the live-notes pass uses
 *  (never search, never the reasoner). Subject-agnostic on purpose — a
 *  recording could be a law seminar, a stand-up, or an interview, never assume
 *  a biomedical lecture. */
export function buildRecordingTitleMessages(transcript: string, notes?: string): WireMsg[] {
  const head = transcript.trim().slice(0, RECORDING_TITLE_TRANSCRIPT_CHARS);
  const notesHint = (notes ?? "").trim().slice(0, RECORDING_TITLE_NOTES_CHARS);
  return [
    {
      role: "system",
      content:
        "You name recordings. Given a transcript, reply with a short, human title — what a student would call this recording in their notes: the lecture, meeting, or topic name. " +
        "Support any subject, discipline, or setting; never assume a biomedical or medical context. " +
        "Rules: at most about eight words; no surrounding quotes; no trailing period; no label like \"Title:\"; no markdown. " +
        "Reply with the title alone and nothing else.",
    },
    {
      role: "user",
      content: [
        notesHint ? `Notes captured from this recording:\n${notesHint}` : "",
        `Transcript (beginning):\n${head}`,
      ].filter(Boolean).join("\n\n"),
    },
  ];
}

/** Trim to `max`, preferring the last word boundary so a cut title never ends
 *  mid-word, then shave any punctuation the cut left dangling. */
function capOnWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  // Only honour the boundary if it isn't so early that we'd throw away most of
  // the allowance (a single very long word still gets a hard cut).
  const cut = lastSpace > Math.floor(max * 0.6) ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[.,;:!?\-–—\s]+$/u, "").trim();
}

/** Turn the model's reply into a card headline, or null when there's nothing
 *  usable so the caller keeps its timestamp fallback (never "untitled"/"null").
 *  Defensive against real model habits: fenced blocks, a leading "Title:" or
 *  "**Topic:**" label, a preamble before the name, and straight OR smart
 *  quotes around it. */
export function cleanRecordingTitle(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  // Peel a wrapping code fence before splitting into lines.
  const unfenced = raw.trim().replace(/^```(?:\w+)?\s*/i, "").replace(/\s*```$/i, "");
  // Take the first line with real content — the name, not a preamble/paragraph.
  const firstLine = unfenced.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0) ?? "";
  let text = firstLine
    // Drop markdown emphasis/code markers wherever they sit (**Topic**, `x`).
    .replace(/[*`]/gu, "")
    // Strip leading heading/quote/bullet markers.
    .replace(/^[#>\s-]+/u, "")
    // Strip a leading label the model sometimes prepends.
    .replace(/^(?:title|topic|name|recording)\s*[:\-–—]\s*/iu, "")
    // Strip surrounding quotes — straight and smart.
    .replace(/^["'“”‘’]+/u, "")
    .replace(/["'“”‘’]+$/u, "")
    // Collapse internal whitespace.
    .replace(/\s+/gu, " ")
    .trim()
    // Shave trailing sentence punctuation.
    .replace(/[.,;:!?]+$/u, "")
    .trim();
  if (!text) return null;
  const lowered = text.toLowerCase();
  if (lowered === "null" || lowered === "untitled" || lowered === "undefined") return null;
  text = capOnWord(text, RECORDING_TITLE_MAX_CHARS);
  return text || null;
}

/** Plain spoken duration for the recording card (owner: "Recorded 25 minutes").
 *  Deliberately loose — whole minutes and hours only, no seconds — because the
 *  exact length isn't the point, the "this is a recording, roughly this long"
 *  read is. Anything under a minute is just "under a minute". */
export function spokenRecordingDuration(durationSeconds: number): string {
  const seconds = Math.max(0, Math.floor(durationSeconds));
  if (seconds < 60) return "Recorded under a minute";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  return `Recorded ${parts.join(" ")}`;
}
