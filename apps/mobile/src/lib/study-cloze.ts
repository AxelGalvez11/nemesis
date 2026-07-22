// Cloze deletions for study review, Anki-compatible syntax:
// {{c1::answer}} or {{c1::answer::hint}}. One card row holds every deletion;
// review rotates which number is hidden so each blank gets exercised.
//
// Straight port of apps/web/lib/workspace/study-cloze.ts — keep the two in
// sync. The phone had NO cloze parser at all until 2026-07-22, which is why the
// Captain Hook starter deck rendered `{{c1:: ![](…) }}` on screen as literal
// text (owner screenshot). Those rows carry the raw syntax in the database, so
// this has to happen at RENDER time; fixing the importer would do nothing for
// decks already synced to a phone.
//
// Note what the rendered output IS: markdown. The active blank comes back as
// `**[...]**` and the revealed answer as `**answer**`, so the caller must run
// it through the markdown renderer (MessageBody), never a bare <Text>. That
// also matters because a cloze answer is often an image — `{{c1:: ![](url) }}`
// is the single most common shape in the starter deck.

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
/** Whether wrapping this answer in `**` will actually read as emphasis.
 *
 *  It does not for an image or a multi-line answer, and the failure is LOUD:
 *  the starter deck stores `{{c1:: ![](url) }}`, whose answer is an image
 *  padded with spaces, and `** ![](url) **` is not a valid emphasis run — so
 *  markdown leaves the asterisks alone and you get literal `**` floating above
 *  and below the picture (caught on screenshot, 2026-07-22). An image answer
 *  needs no emphasis anyway: the picture IS the reveal.
 *
 *  This is the one place the phone's copy diverges from web's
 *  lib/workspace/study-cloze.ts — web very likely leaks the same asterisks and
 *  is worth the same fix, but that's a separate change to a separate surface. */
function canEmphasise(answer: string): boolean {
  return answer.length > 0 && !answer.includes("\n") && !answer.includes("![");
}

export function renderCloze(text: string, active: number | null, revealed: boolean): string {
  return text.replace(CLOZE_PATTERN, (_match, rawNumber: string, body: string) => {
    const separator = body.indexOf("::");
    const answer = (separator === -1 ? body : body.slice(0, separator)).trim();
    const hint = separator === -1 ? "" : body.slice(separator + 2).trim();
    if (Number(rawNumber) !== active) return answer;
    if (revealed) return canEmphasise(answer) ? `**${answer}**` : answer;
    return `**[${hint || "..."}]**`;
  });
}
