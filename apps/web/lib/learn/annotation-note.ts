// An annotation the learner made on a document and sent to the conversation.
//
// 🔴🔴 AN ANNOTATION IS NOT AN ATTACHMENT, AND THE DIFFERENCE IS WHY THIS TYPE EXISTS. The crop
// already travels as a `File` — `document-reader.tsx` has been cropping the drawn box and sending
// it since the annotate layer shipped — so the bytes were never the missing piece. What was missing
// is that the conversation had no way to say WHAT that file was. It arrived as an ordinary
// attachment and drew an ordinary file chip, so "I circled this bit of the chart and asked about
// it" and "I dropped a PNG in" looked identical.
//
// 🪦 AND THE OWNER CUT THE FILE LIST FROM HIS OWN MESSAGES, which is exactly why this must not be
// one. `learning-canvas.tsx` carries the tombstone: the live turn named its files for about an hour
// and he removed it the same afternoon. An annotation is the opposite case — he asked for it by
// name, twice, with screenshots of ChatGPT showing the cropped region above the message and a
// count chip under it. A picture of the thing you pointed at is not a list of what you uploaded.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER (CLAUDE.md). A circled region of a drug chart, a bar chart
// and a page of case law are the same object here.
//
// PURE. No React, no I/O, no clock.

/** One region the learner marked and asked about. */
export interface AnnotationNote {
  /**
   * A URL for the cropped picture, or null.
   *
   * 🔴 SESSION-LIVED BY NATURE, AND THE CALLER OWNS IT. This is an object URL over the crop the
   * reader made; it dies with the document. That is honest rather than unfortunate: the crop is
   * also attached to the canvas as a real file, so the MATERIAL survives a reload even when this
   * thumbnail does not. `annotationLabel` works without it, which is what keeps the chip truthful
   * on a reopened conversation.
   */
  readonly thumbnail: string | null;
  /** Which page or sheet it was on, when the document has such a thing. Shown as a hint, never as
   *  a claim: a flowing document has no page and must not be given an invented one. */
  readonly where: string | null;
}

/**
 * The chip's words.
 *
 * 🔴 IT COUNTS, AND THE SINGULAR IS NOT COSMETIC. "1 annotations" is the tell of a count printed
 * without being read, and this chip sits directly above the learner's own sentence where it is the
 * most-read text on the turn.
 */
export function annotationLabel(count: number): string {
  return `${count} ${count === 1 ? "annotation" : "annotations"}`;
}

/**
 * Should the conversation draw anything for this turn?
 *
 * 🔴 A TURN WITH NO ANNOTATIONS DRAWS NOTHING AT ALL — not an empty chip, not a zero. Almost every
 * turn is that turn, so the quiet case is the one that has to cost nothing on screen.
 */
export function hasAnnotations(notes: readonly AnnotationNote[] | null | undefined): boolean {
  return (notes?.length ?? 0) > 0;
}
