// Turning AssemblyAI's per-utterance output into the transcript we store.
//
// Owner 2026-07-27, on the recording pipeline: "the audio gets a clean high
// quality pass with diarization so the AI notes can generate the quality notes
// once." Speaker labels matter for a lecture in one specific way — a classmate's
// question, and especially a classmate's WRONG guess, should not end up in the
// notes as something the lecturer established.
//
// Standard diarization is +$0.02/hr on top of AssemblyAI's async rate
// (assemblyai.com/pricing, checked 2026-07-27), which is why this is worth
// doing at all: it is a tenth of the transcription line, not a new engine.
//
// PURE, because the two rules that make the difference between a useful
// transcript and a wall of noise are both judgement calls that should be
// testable without a provider:
//
//   1. CONSECUTIVE utterances by one speaker are merged. AssemblyAI splits on
//      pauses, so an unmerged hour of lecture is hundreds of one-sentence
//      "Speaker A:" lines — it inflates the transcript the notes pass is billed
//      for, and reads like a chat log rather than a lecture.
//   2. A recording with only ONE speaker gets no labels at all. Prefixing every
//      paragraph of a solo lecture with "Speaker A:" is pure noise, and it is
//      the common case.

/** One AssemblyAI utterance, narrowed to what we use. */
export interface Utterance {
  speaker: string;
  text: string;
}

/** Utterances out of a polled AssemblyAI response, or [] if the shape is not
 *  what we expect. Never throws — a provider change must degrade to the plain
 *  `text` transcript, not fail the whole job. */
export function utterancesOf(value: unknown): Utterance[] {
  if (!Array.isArray(value)) return [];
  const out: Utterance[] = [];
  for (const row of value) {
    if (typeof row !== "object" || row === null) continue;
    const { speaker, text } = row as Record<string, unknown>;
    const line = typeof text === "string" ? text.trim() : "";
    if (!line) continue;
    out.push({ speaker: typeof speaker === "string" ? speaker.trim() : "", text: line });
  }
  return out;
}

/**
 * The same utterances, from a provider that labels WORDS rather than turns.
 *
 * xAI's STT returns `words[].speaker` (docs.x.ai, speech-to-text, checked
 * 2026-07-28) instead of AssemblyAI's ready-made utterances. Grouping runs of
 * consecutive words by the same speaker turns one shape into the other, so both
 * providers meet the same merge-and-drop rules above rather than each growing
 * its own transcript formatter.
 *
 * Never throws: an unrecognised shape returns [], which degrades to the flat
 * text exactly like a provider that sent no diarization at all.
 */
export function utterancesFromWords(value: unknown): Utterance[] {
  if (!Array.isArray(value)) return [];
  const out: Utterance[] = [];
  for (const row of value) {
    if (typeof row !== "object" || row === null) continue;
    const { speaker, word, text } = row as Record<string, unknown>;
    // `word` is xAI's field; `text` is accepted too so a provider that renames
    // it does not silently produce an empty transcript.
    const token = typeof word === "string" ? word.trim() : typeof text === "string" ? text.trim() : "";
    if (!token) continue;
    const who = typeof speaker === "string"
      ? speaker.trim()
      : typeof speaker === "number"
        ? String(speaker)
        : "";
    const last = out[out.length - 1];
    if (last && last.speaker === who) {
      last.text = `${last.text} ${token}`;
      continue;
    }
    out.push({ speaker: who, text: token });
  }
  return out;
}

/**
 * The transcript to store, given diarized utterances and the provider's own
 * flat `text`. Falls back to `text` whenever the utterances are missing, empty,
 * or all one speaker — see the two rules in this file's header.
 */
export function formatDiarizedTranscript(utterances: readonly Utterance[], fallbackText: string): string {
  const flat = fallbackText.trim();
  if (utterances.length === 0) return flat;

  // Counted WITHOUT dropping the blanks. Filtering them out first looks tidier
  // and is wrong: a recording where the provider labelled the lecturer and left
  // one interjection blank has two voices, and filtering collapsed it to one —
  // so the interjection lost its attribution, which is the whole point of the
  // feature. All-blank still counts as one, which is the unlabelled case.
  const speakers = new Set(utterances.map((utterance) => utterance.speaker));
  // One voice — the flat text already carries the provider's own paragraphing,
  // so prefer it over re-joining.
  if (speakers.size <= 1) return flat || joinUnlabelled(utterances);

  const blocks: string[] = [];
  let current: Utterance | null = null;
  for (const utterance of utterances) {
    if (current && current.speaker === utterance.speaker) {
      current = { speaker: current.speaker, text: `${current.text} ${utterance.text}` };
      continue;
    }
    if (current) blocks.push(label(current));
    current = utterance;
  }
  if (current) blocks.push(label(current));
  // Blank line between blocks: it is the break the notes window planner
  // prefers, so a diarized transcript splits on speaker turns rather than
  // mid-sentence (apps/mobile/src/lib/live-notes.ts planFinalNotesWindows).
  return blocks.join("\n\n");
}

/** "Speaker A: …" — AssemblyAI already returns bare letters, so an unlabelled
 *  utterance in a multi-speaker recording is named rather than left bare. */
function label(utterance: Utterance): string {
  const who = utterance.speaker || "?";
  return `Speaker ${who}: ${utterance.text}`;
}

function joinUnlabelled(utterances: readonly Utterance[]): string {
  return utterances.map((utterance) => utterance.text).join("\n\n");
}
