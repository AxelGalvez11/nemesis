// Report title cleanup (Library / workspace surfaces). PURE. A saved research report's title is the
// raw prompt with a scoping suffix the Ask flow appends: "<question>\n\nFocus: <clauses>" (see
// apps/web/app/app/ask/page.tsx). For a clean library row we drop that suffix, normalize whitespace,
// uppercase the first letter, and cap the length. Display-only — never mutates the stored title.

const MAX = 90;

export function displayReportTitle(raw: string): string {
  if (!raw) return "";
  // Drop everything from the first "Focus:" scoping marker onward (it starts after a blank/newline).
  const withoutFocus = raw.replace(/\s*\n+\s*Focus:[\s\S]*$/i, "");
  // Collapse all runs of whitespace (incl. newlines) to single spaces, then trim.
  const collapsed = withoutFocus.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  const capped = collapsed.length > MAX ? `${collapsed.slice(0, MAX - 1)}…` : collapsed;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}
