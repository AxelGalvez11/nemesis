// Pure GFM-table string logic for the Library editor's always-rendered table
// widget (library-table-widget.ts): row splitting/building with escaped-pipe
// handling, alignment specs, and the display form of a cell (inline marks
// stripped). Kept dependency-free so the editing round-trip is unit-testable.

export type ColumnAlign = "left" | "center" | "right";

/** Split one markdown table row into cells (leading/trailing pipes dropped,
 *  escaped pipes kept as literal `|`). */
export function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "\\" && trimmed[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/** Rebuild one markdown row line from raw cell texts — the inverse of
 *  splitTableRow: literal pipes re-escaped, newlines flattened, single-space
 *  padding for readable source. */
export function buildTableRow(cells: string[]): string {
  const rendered = cells.map((cell) => cell.replace(/\r?\n/g, " ").trim().replace(/\|/g, "\\|"));
  return `| ${rendered.join(" | ")} |`;
}

export function columnAlignments(delimiter: string): ColumnAlign[] {
  return splitTableRow(delimiter).map((cell) => {
    const spec = cell.trim();
    if (spec.startsWith(":") && spec.endsWith(":")) return "center";
    if (spec.endsWith(":")) return "right";
    return "left";
  });
}

/** An empty row matching the table's column count — appended when Tab/Enter
 *  walks past the last cell. */
export function emptyTableRow(columns: number): string {
  return buildTableRow(Array.from({ length: Math.max(columns, 1) }, () => ""));
}

/** Strip inline markdown marks for cell display; the raw text comes back
 *  while the cell is focused so nothing is lost on edit. */
export function displayCellText(raw: string): string {
  return raw
    .trim()
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?u>/g, "");
}

export interface TableRowSlot {
  /** Offset of the row's line start within the table source. */
  offset: number;
  /** Raw line text. */
  line: string;
  /** True for the `| --- |` alignment row (not rendered, never edited). */
  isDelimiter: boolean;
}

/** Slice a table's source into row slots with their in-table offsets. */
export function tableRowSlots(source: string): TableRowSlot[] {
  const slots: TableRowSlot[] = [];
  let offset = 0;
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    slots.push({
      isDelimiter: index === 1 && /^\s*\|?[\s:|-]+\|?\s*$/.test(line),
      line,
      offset,
    });
    offset += line.length + 1;
  });
  return slots;
}
