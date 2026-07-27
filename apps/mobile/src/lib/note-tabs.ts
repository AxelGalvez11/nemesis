// The note screen's browser-style history, lifted OUT of the component (owner
// 2026-07-21: the pill bar's numbered square opens a real TAB VIEWER, so the
// set of open notes has to survive leaving to the Library and coming back — a
// component-scoped ref died with the screen). One module-scoped holder keeps
// the state for the app's lifetime (an app relaunch starts fresh); every
// transition is a pure function returning a NEW state object, so all of the
// history/tab math Deno-tests without React, matching lib/library-sync.ts's
// convention.
//
// The model stays a single history STACK with a cursor (‹ › semantics are
// unchanged): "tabs" are the view over it — distinct ids, most recently
// visited first (openTabIds). Switching tabs moves the cursor to that note's
// latest visit (selectTab -> pendingIndex, consumed by arriveAt); closing a
// tab removes every visit of that note and re-anchors the cursor.

export interface NoteNavState {
  /** Note ids in visit order — duplicates allowed, it's a history stack. */
  stack: readonly string[];
  /** Cursor into `stack`; -1 while empty. */
  index: number;
  /** A ‹ › / tab-switch move in flight: the stack position the next arrival
   *  should adopt instead of pushing. Null when no move is pending. */
  pendingIndex: number | null;
}

export const EMPTY_NOTE_NAV: NoteNavState = { index: -1, pendingIndex: null, stack: [] };

/** The app-lifetime holder. The note screen reads/writes `current`; nothing
 *  else touches it. Module scope on purpose — see the header. */
export const noteNavHolder: { current: NoteNavState } = { current: EMPTY_NOTE_NAV };

/** Record that the screen now shows `noteId`. A pending ‹ ›/tab move that
 *  lands where it aimed just adopts that cursor; re-arriving at the current
 *  note is a no-op; anything else — first open, wikilink, search pick, a
 *  fresh "+" note — pushes and drops the forward tail, like a browser. */
export function arriveAt(nav: NoteNavState, noteId: string): NoteNavState {
  if (nav.pendingIndex !== null && nav.stack[nav.pendingIndex] === noteId) {
    return { index: nav.pendingIndex, pendingIndex: null, stack: nav.stack };
  }
  if (nav.stack[nav.index] === noteId) {
    return nav.pendingIndex === null ? nav : { ...nav, pendingIndex: null };
  }
  const stack = [...nav.stack.slice(0, nav.index + 1), noteId];
  return { index: stack.length - 1, pendingIndex: null, stack };
}

/** The open-tab set: distinct ids, most recently visited first. */
export function openTabIds(stack: readonly string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const id = stack[i];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Aim the cursor at an already-open note's LATEST visit (a tab switch — no
 *  push, no forward-tail drop). Returns `nav` unchanged when the id isn't in
 *  the stack (or is the current note): the caller's navigation then lands as
 *  an ordinary arriveAt. */
export function selectTab(nav: NoteNavState, id: string): NoteNavState {
  const at = nav.stack.lastIndexOf(id);
  if (at === -1 || at === nav.index) return nav;
  return { ...nav, pendingIndex: at };
}

/** Close a tab: every visit of `closeId` leaves the stack. Closing a
 *  background tab keeps the current note in place (its cursor is recounted);
 *  closing the CURRENT tab lands where back would have gone — the nearest
 *  earlier surviving visit, else the nearest later one — and `nextId` tells
 *  the caller which note to navigate to. `nextId` is null when no navigation
 *  is needed (background close, unknown id, or nothing left open). */
export function closeTab(nav: NoteNavState, closeId: string): { nav: NoteNavState; nextId: string | null } {
  if (!nav.stack.includes(closeId)) return { nav, nextId: null };
  const stack = nav.stack.filter((id) => id !== closeId);
  if (stack.length === 0) return { nav: EMPTY_NOTE_NAV, nextId: null };

  const survivorsUpTo = (position: number): number => {
    let count = -1;
    for (let i = 0; i <= position; i += 1) if (nav.stack[i] !== closeId) count += 1;
    return count;
  };

  if (nav.stack[nav.index] !== closeId) {
    return { nav: { index: survivorsUpTo(nav.index), pendingIndex: null, stack }, nextId: null };
  }

  let landAt = -1;
  for (let i = nav.index - 1; i >= 0; i -= 1) {
    if (nav.stack[i] !== closeId) {
      landAt = i;
      break;
    }
  }
  if (landAt === -1) {
    for (let i = nav.index + 1; i < nav.stack.length; i += 1) {
      if (nav.stack[i] !== closeId) {
        landAt = i;
        break;
      }
    }
  }
  const index = survivorsUpTo(landAt);
  return { nav: { index, pendingIndex: null, stack }, nextId: stack[index] };
}

/** The tab card's body snippet: the note's opening text with markdown noise
 *  stripped, flattened to one run of prose. Slices FIRST so running it over a
 *  whole cached library stays cheap even with huge notes; a note that OPENS
 *  with a wall of syntax (a long code block, say) can strip its whole first
 *  slice to nothing, so one deeper look runs before giving up (review
 *  finding, 2026-07-21). */
export function previewOf(content: string, max = 220): string {
  const strip = (chars: number) =>
    content
      .slice(0, chars)
      // Leading YAML frontmatter block, then any stray horizontal-rule /
      // frontmatter-fence lines — otherwise a note that opens with "---"
      // shows literal dashes (and its metadata keys) as its "prose" snippet.
      .replace(/^---\s*\n[\s\S]*?\n---\s*(\n|$)/, " ")
      .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, " ")
      .replace(/```[\s\S]*?(```|$)/g, " ")
      .replace(/^#{1,6}\s.*$/gm, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target)
      .replace(/(\*\*|__|~~|==|`)/g, "")
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/\|/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const first = strip(max * 4);
  return (first || strip(max * 16)).slice(0, max);
}

/** The note as READABLE TEXT — markdown syntax removed, line structure kept.
 *
 *  This exists for Find (owner 2026-07-24: "dont show markdown preview at all").
 *  Reading a note renders real markdown, but searching it did not: to highlight
 *  a match you have to own the <Text> nodes, and the markdown renderer builds
 *  its own, so Find fell back to printing the note's SOURCE. Turning Find on
 *  therefore turned a clean page into "## Beta blockers", "**bradycardia**" and
 *  tables full of pipes — the one place raw markdown still reached the screen
 *  outside the editor.
 *
 *  So: strip the syntax, keep the words and the lines, and search THAT. Matching
 *  against the stripped text is also more honest than matching the source —
 *  nobody looking for "bold" means the two asterisks around it.
 *
 *  Deliberately NOT previewOf: that one collapses every run of whitespace into a
 *  single space and truncates, because a one-line snippet is its whole job. Here
 *  the paragraphs have to survive. The substitutions are otherwise the same set,
 *  in the same order, and the reasoning behind each lives on previewOf above. */
export function plainTextOf(content: string): string {
  const inline = content
    .replace(/^---\s*\n[\s\S]*?\n---\s*(\n|$)/, "")
    // Fence LINES go, the code between them stays — it is text you may well be
    // searching for.
    .replace(/^\s*```.*$/gm, "")
    .replace(/^(#{1,6})\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target)
    .replace(/(\*\*|__|~~|==|`)/g, "")
    // A real bullet, so a list still reads as one without a "-" in front.
    .replace(/^(\s*)[-*+]\s+/gm, "$1• ")
    .replace(/^\s*>\s?/gm, "");

  // Tables are handled a LINE AT A TIME, not by swapping every "|" for spaces.
  // Doing it globally left the outer pipes of "| Drug | Class |" behind as
  // padding on both ends, and blanked the |---|---| row in place instead of
  // removing it — so a three-row table came out indented with a hole through
  // the middle of it.
  const lines: string[] = [];
  for (const raw of inline.split("\n")) {
    if (!raw.includes("|")) {
      lines.push(raw.replace(/[ \t]+$/, ""));
      continue;
    }
    // The alignment row (|---|:--:|) carries no words at all.
    if (/^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(raw)) continue;
    lines.push(
      raw
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0)
        .join("   "),
    );
  }

  // Three or more blank lines can only be an artifact of what was removed.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
