export type StudyTextImportSource = "anki" | "quizlet";

export interface StudyTextImportCard {
  front: string;
  back: string;
  cardType: "basic" | "cloze";
  tags: string[];
}

export interface StudyTextImportResult {
  cards: StudyTextImportCard[];
  skipped: number;
  delimiter: "tab" | "comma" | "semicolon";
}

const MAX_IMPORT_CARDS = 5_000;

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, token: string) => {
    const lower = token.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    return named[lower] ?? "";
  });
}

function cleanField(value: string): string {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p|li)>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20_000);
}

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function delimiterOf(text: string): { char: string; name: StudyTextImportResult["delimiter"] } {
  const header = text.match(/^#separator:(tab|comma|semicolon)\s*$/im)?.[1]?.toLowerCase();
  if (header === "comma") return { char: ",", name: "comma" };
  if (header === "semicolon") return { char: ";", name: "semicolon" };
  if (header === "tab") return { char: "\t", name: "tab" };
  const sample = text
    .split(/\r?\n/)
    .find((line) => line.trim() && !line.trimStart().startsWith("#")) ?? "";
  const candidates = [
    { char: "\t", count: (sample.match(/\t/g) ?? []).length, name: "tab" as const },
    { char: ";", count: (sample.match(/;/g) ?? []).length, name: "semicolon" as const },
    { char: ",", count: (sample.match(/,/g) ?? []).length, name: "comma" as const },
  ].sort((left, right) => right.count - left.count);
  const picked = candidates[0];
  return picked?.count ? { char: picked.char, name: picked.name } : { char: "\t", name: "tab" };
}

/** Parse copied Quizlet exports or Anki text exports without uploading the
 * source text. Both formats reduce to one term/front and definition/back pair
 * per row; Anki cloze syntax is preserved. */
export function parseStudyTextImport(raw: string, source: StudyTextImportSource): StudyTextImportResult {
  const text = raw.replace(/^\uFEFF/, "");
  const delimiter = delimiterOf(text);
  const seen = new Set<string>();
  const cards: StudyTextImportCard[] = [];
  let skipped = 0;
  for (const row of parseRows(text, delimiter.char)) {
    if (row[0]?.trimStart().startsWith("#")) continue;
    const front = cleanField(row[0] ?? "");
    const back = cleanField(row[1] ?? "");
    const cloze = source === "anki" && /\{\{c\d+::.+?\}\}/s.test(front);
    const key = front.toLocaleLowerCase().replace(/\s+/g, " ");
    if (!front || (!back && !cloze) || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    cards.push({
      back,
      cardType: cloze ? "cloze" : "basic",
      front,
      tags: source === "anki" ? (row[2] ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 30) : [],
    });
    if (cards.length >= MAX_IMPORT_CARDS) break;
  }
  return { cards, delimiter: delimiter.name, skipped };
}
