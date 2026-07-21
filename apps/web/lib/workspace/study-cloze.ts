// Cloze deletions for study review, Anki-compatible syntax:
// {{c1::answer}} or {{c1::answer::hint}}. One card row holds every deletion;
// review rotates which number is hidden so each blank gets exercised.

const CLOZE_PATTERN = /\{\{c(\d+)::([\s\S]*?)\}\}/g;

export function clozeNumbers(text: string): number[] {
  const numbers = new Set<number>();
  for (const match of text.matchAll(CLOZE_PATTERN)) numbers.add(Number(match[1]));
  return Array.from(numbers).sort((a, b) => a - b);
}

export function hasCloze(text: string): boolean {
  return clozeNumbers(text).length > 0;
}

/** Which cloze number this review hides: rotates by repetition count. */
export function activeClozeNumber(text: string, repetitions: number): number | null {
  const numbers = clozeNumbers(text);
  if (numbers.length === 0) return null;
  const safe = Number.isFinite(repetitions) && repetitions > 0 ? Math.floor(repetitions) : 0;
  return numbers[safe % numbers.length] ?? null;
}

/**
 * Replace cloze markers with review markdown. The active number renders as
 * **[...]** (or **[hint]**) until revealed, then as the bolded answer; every
 * other deletion always shows its plain answer for context.
 */
export function renderCloze(text: string, active: number | null, revealed: boolean): string {
  return text.replace(CLOZE_PATTERN, (_match, rawNumber: string, body: string) => {
    const separator = body.indexOf("::");
    const answer = separator === -1 ? body : body.slice(0, separator);
    const hint = separator === -1 ? "" : body.slice(separator + 2).trim();
    if (Number(rawNumber) !== active) return answer;
    if (revealed) return `**${answer}**`;
    return `**[${hint || "..."}]**`;
  });
}
