// Two keys, and the exact conditions under which they mean anything.
//
// 🔴 THE DECISIONS LIVE HERE AND THE SIDE EFFECTS DO NOT. No `preventDefault`, no state, no
// listeners — the same split `composer-intent.ts` uses, and for the same reason: every way these
// shortcuts go wrong is a CONDITION rather than an effect. A modifier held, a key repeat, focus
// sitting in a text box, a browser with no speech API. Each of those is a silent failure in wiring
// and a one-line test here.
//
// 🔴 AND THE FAILURE MODES ARE NOT SYMMETRIC, WHICH IS WHY THE GUARDS LEAN THE WAY THEY DO. A
// shortcut that does not fire costs the learner one click. A shortcut that fires while they are
// typing eats a keystroke out of an answer, or opens a microphone they did not ask to open. So
// every ambiguous case here refuses.

/**
 * Enough of a keyboard event to decide, and no more.
 *
 * Deliberately structural rather than `KeyboardEvent`: these functions are decisions about a
 * keystroke, and taking the DOM type would mean a DOM to test them.
 */
export interface Keystroke {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** The key is being held and the browser is repeating it. */
  repeat: boolean;
}

/** Enough of the focused element to know whether the learner is writing into it. */
export interface FocusTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

/**
 * Is the learner typing into something right now?
 *
 * 🔴 ONE PREDICATE, SHARED BY BOTH SHORTCUTS, BECAUSE TWO WOULD DRIFT. The `/` shortcut already in
 * the composer checks `HTMLInputElement || HTMLTextAreaElement` and stops there. That is complete
 * for this surface today — the canvas has no contenteditable, and the written-work sheet is a
 * `<canvas>` with pointer handlers — but "complete today" is how a guard rots. A contenteditable
 * added later would make space-to-talk eat spaces out of whatever it was, and nothing would fail
 * until someone typed.
 */
export function isTypingTarget(target: FocusTarget | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Anything that turns a bare key into a different instruction to the operating system. */
function unmodified(event: Keystroke): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}

export interface PushToTalkContext {
  /** The learner is writing into a field. */
  typing: boolean;
  /** The written-work sheet is open; space is not ours to take there. */
  drawing: boolean;
  /** Already listening — a repeat press must not restart and lose the transcript so far. */
  listening: boolean;
  /** This browser has the Web Speech API at all. Firefox does not. */
  supported: boolean;
}

/**
 * Hold space to talk.
 *
 * 🔴 SPACE IS THE MOST DANGEROUS KEY TO CLAIM, AND EVERY GUARD BELOW IS ONE WAY IT BITES. It types
 * a character, it scrolls the page, and it activates whatever button has focus — including the
 * Continue the learner just pressed with the mouse. So this fires only on a bare, first press,
 * outside any text field, and the caller must still stop the default on both down and up.
 *
 * 🔴 `repeat` IS NOT A TIDY-UP. Holding a key makes the browser fire keydown over and over; without
 * this the second one would call `start()` again, and `startDictation` snapshots the text typed
 * beforehand each time — so a two-second hold would overwrite that snapshot with the transcript
 * already in the box and lose what the learner had typed.
 */
export function startsPushToTalk(event: Keystroke, context: PushToTalkContext): boolean {
  if (event.key !== " ") return false;
  if (event.repeat) return false;
  if (!unmodified(event)) return false;
  if (!context.supported) return false;
  return !context.typing && !context.drawing && !context.listening;
}

/**
 * Let go.
 *
 * 🔴 NO CONTEXT, AND THAT ASYMMETRY IS DELIBERATE. Starting is a decision; stopping is a release,
 * and a release must never be refused. If a guard could block this, any state that changed while
 * the key was held would leave the microphone open — which is the one outcome that costs money and
 * privacy rather than a click. The caller stops on window blur for the same reason: keyup does not
 * arrive if the learner tabs away mid-hold.
 */
export function endsPushToTalk(event: Pick<Keystroke, "key">): boolean {
  return event.key === " ";
}

export interface ContinueContext {
  /** The learner is writing into a field — the composer keeps its own meaning for Enter. */
  typing: boolean;
  /** There is a Continue on screen to press. */
  available: boolean;
}

/**
 * Command-Enter presses the Continue that is on screen.
 *
 * 🔴 IT CANNOT PRESS PAST A QUESTION, AND IT GETS THAT FOR FREE. `available` comes from
 * `continueOwner`, which returns null while a demonstration is owed (its N3 guard) and while the
 * canvas is busy. The shortcut inherits that rather than re-deciding it, so there is no second
 * place where "may the learner move on?" is answered.
 *
 * 🔴 IT STANDS DOWN INSIDE THE COMPOSER, WHERE ENTER ALREADY MEANS SOMETHING. The composer's
 * textarea submits on `Enter && !shiftKey`, which Command-Enter already satisfies — so it submits
 * there today and still does. Claiming it globally would silently change what Command-Enter does
 * to a half-typed question, to save a keystroke the learner did not ask to save.
 *
 * 🔴 CONTROL-ENTER TOO. The canvas runs in a browser on every platform this product supports, and a
 * shortcut that works only on a Mac is a shortcut that is broken for whoever is not on one.
 */
export function pressesContinue(event: Keystroke, context: ContinueContext): boolean {
  if (event.key !== "Enter") return false;
  if (!event.metaKey && !event.ctrlKey) return false;
  if (event.altKey || event.shiftKey) return false;
  return context.available && !context.typing;
}
