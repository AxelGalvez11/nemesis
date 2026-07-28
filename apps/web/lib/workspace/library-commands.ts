// The "/" menu for Library notes (owner 2026-07-28: "notion like functionality
// … add in commands for bold italicize etc.").
//
// The note is markdown underneath and stays markdown — the live preview already
// hides the syntax, so a student never sees `##` or `**`. What was missing was a
// way to GET those blocks without knowing they exist. Typing "/" now offers
// them by name.
//
// Everything here is pure: the trigger rule, the filtering, and the text each
// command produces. The CodeMirror glue does nothing but apply it, so the part
// that decides whether a slash is a command or just a slash can be tested
// without an editor.

export type LibraryCommandGroup = "Headings" | "Lists" | "Blocks";

export interface LibraryCommand {
  id: string;
  /** What the student reads in the menu. */
  label: string;
  /** One short line under the label. */
  hint: string;
  group: LibraryCommandGroup;
  /** Extra words that should find this command — a beginner searches for what
   *  they want to DO ("bullet", "todo"), not for what markdown calls it. */
  keywords: string[];
  /** Markdown inserted in place of the "/query". */
  insert: string;
  /** Where the caret lands, as an offset into `insert`. Defaults to the end. */
  caret?: number;
}

export const LIBRARY_COMMANDS: LibraryCommand[] = [
  { group: "Headings", hint: "Big section title", id: "h1", insert: "# ", keywords: ["title", "heading", "big"], label: "Heading 1" },
  { group: "Headings", hint: "Medium section title", id: "h2", insert: "## ", keywords: ["subtitle", "heading"], label: "Heading 2" },
  { group: "Headings", hint: "Small section title", id: "h3", insert: "### ", keywords: ["heading", "small"], label: "Heading 3" },
  { group: "Lists", hint: "A simple bulleted list", id: "bullets", insert: "- ", keywords: ["bullet", "point", "unordered"], label: "Bulleted list" },
  { group: "Lists", hint: "A numbered list", id: "numbers", insert: "1. ", keywords: ["number", "ordered", "steps"], label: "Numbered list" },
  { group: "Lists", hint: "Tick things off as you go", id: "todo", insert: "- [ ] ", keywords: ["todo", "task", "checkbox", "check"], label: "To-do list" },
  { group: "Blocks", hint: "Set a passage apart", id: "quote", insert: "> ", keywords: ["quote", "callout", "blockquote"], label: "Quote" },
  { group: "Blocks", hint: "A line across the page", id: "divider", insert: "---\n", keywords: ["divider", "rule", "separator", "line", "break"], label: "Divider" },
  {
    caret: 2,
    group: "Blocks",
    hint: "Rows and columns",
    id: "table",
    insert: "| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n",
    keywords: ["table", "grid", "rows", "columns"],
    label: "Table",
  },
  { caret: 4, group: "Blocks", hint: "Code, kept as you typed it", id: "code", insert: "```\n\n```\n", keywords: ["code", "snippet", "monospace"], label: "Code block" },
];

export interface SlashTrigger {
  /** Column of the "/" within the line. */
  from: number;
  /** What has been typed after it, lowercased. */
  query: string;
}

/**
 * Is the caret sitting in a "/command" at the start of a line?
 *
 * Deliberately narrow. A slash is an ordinary character — "and/or", a URL, a
 * date like 12/3 — and popping a menu over ordinary prose would make the editor
 * feel possessed. So the slash has to open the line, optionally after
 * indentation and a list marker, because wanting a heading from inside a list
 * item is normal.
 */
export function slashTriggerAt(lineText: string, cursorColumn: number): SlashTrigger | null {
  const before = lineText.slice(0, cursorColumn);
  const match = /^(\s*(?:[-*+]\s+|\d+[.)]\s+)?)\/([\p{L}\d-]*)$/u.exec(before);
  if (!match) return null;
  return { from: match[1]?.length ?? 0, query: (match[2] ?? "").toLowerCase() };
}

/**
 * Commands matching what has been typed, in catalogue order.
 *
 * Matches a PREFIX of the label or of any keyword rather than a substring
 * anywhere: "/li" should offer "Lists", not everything containing an L.
 */
export function matchLibraryCommands(query: string, catalogue: readonly LibraryCommand[] = LIBRARY_COMMANDS): LibraryCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...catalogue];
  return catalogue.filter((command) => {
    if (command.label.toLowerCase().startsWith(needle)) return true;
    if (command.label.toLowerCase().split(/\s+/).some((word) => word.startsWith(needle))) return true;
    return command.keywords.some((word) => word.startsWith(needle));
  });
}

/** Where the caret should land once a command's text is inserted. */
export function commandCaretOffset(command: LibraryCommand): number {
  return command.caret ?? command.insert.length;
}
