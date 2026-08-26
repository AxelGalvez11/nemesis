// Where the studio keeps your work.
//
// 🔴 LOCAL, NOT ACCOUNT-BACKED, AND THAT IS THE RIGHT CALL FOR THIS TOOL. The studio is
// a design instrument, not a product surface: it has no multi-user story, nothing it
// produces is private, and the output that matters leaves as an export rather than as a
// row in a table. Putting it behind auth would buy nothing and would stop it opening in
// a browser that is not signed in — which is exactly where you want to open a tool for
// judging a picture.
//
// 🔴 EVERY READ GOES THROUGH `normaliseDoc`, WITHOUT EXCEPTION. localStorage outlives
// deploys, so the document being read was written by a build that no longer exists. It
// also outlives the devtools console, so it may have been hand-edited into nonsense.
// Repair-on-read is the only thing standing between either of those and a blank studio.

import { normaliseDoc, newDoc, type StudioDoc } from "./document";

const KEY = "nemesis.character-studio.v1";

/** The document in storage, or a fresh one. Never throws, never returns null. */
export function loadDoc(): StudioDoc {
  if (typeof window === "undefined") return newDoc();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return newDoc();
    return normaliseDoc(JSON.parse(raw));
  } catch {
    // A parse failure, a storage-disabled browser, or a quota error. All three mean the
    // same thing to the caller — there is no usable saved document — and none of them is
    // worth an error boundary in a design tool.
    return newDoc();
  }
}

/**
 * Writes the document, returning whether it landed.
 *
 * 🔴 A FAILED SAVE IS REPORTED, NOT SWALLOWED. Private-mode Safari throws on every
 * `setItem`, and a studio that silently discards an afternoon's work while looking like
 * it is saving is worse than one that says it cannot save. The caller shows a line.
 */
export function saveDoc(doc: StudioDoc): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export function clearDoc(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* Nothing to do and nothing to tell the user — they asked for it gone and it is. */
  }
}
