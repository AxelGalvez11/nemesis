/** Which action the composer's last button offers.
 *
 *  🔴 THIS RULE LIVED INSIDE Composer.tsx AS `value.trim().length > 0`, AND IT
 *  SILENTLY BROKE THE CAMERA. Consulting only the typed text meant a photograph
 *  sitting in an empty composer never produced a send button at all — the owner
 *  (2026-07-30) had attached a picture and found "the composer doesnt show the
 *  'send' icon", so there was no way to ask about the photo they had just taken.
 *  A rule that decides whether a feature is reachable belongs somewhere it can
 *  be tested, not inside a render.
 *
 *  - "send"    — there is something to send and nothing in flight.
 *  - "sending" — the same button, mid-flight. It stays SEND rather than
 *                reverting to "record", because a control that changes identity
 *                while you wait reads as the press having been lost. This is
 *                also the only place a photo turn shows it is working: never as
 *                a spinner on the picture itself, which would say the photo was
 *                being analysed before the student asked for anything.
 *  - "record"  — nothing to send, so the slot offers voice instead.
 */
export type ComposerAction = "send" | "sending" | "record";

export function composerAction(
  typed: string,
  { attached = false, sending = false }: { attached?: boolean; sending?: boolean } = {},
): ComposerAction {
  // 🔴 A TURN IN FLIGHT OWNS THIS BUTTON, WHATEVER THE BOX SAYS — and this check
  // has to come FIRST. It used to sit after the draft check, and that made the
  // Stop button unreachable on every ordinary question: send() empties the box and
  // clears the attachment the instant it fires, so by the time the answer was
  // streaming there was no draft, and the slot fell through to the RECORD circle.
  // Tapping where Stop should be started a recording. The one case that did work
  // was a photo, because its draft outlives the send — which is exactly why this
  // looked fine in the tests that had one attached.
  if (sending) return "sending";
  // An attachment is a turn by itself: a photographed slide asks "what is this?"
  // without a word typed, and photoTurnText supplies those words at send time.
  return typed.trim().length > 0 || attached ? "send" : "record";
}
