// Run: cd apps/web && ../../node_modules/.bin/tsx --test lib/notebooks/cross-format.test.ts
//
// THE CROSS-FORMAT ABSTRACTION, asserted rather than hoped for.
//
// packages/shared/src/doc-model.ts is the keystone of the whole ingestion path: once a parser has
// normalized a file into a `ParsedDocument`, NOTHING downstream may branch on whether the bytes
// arrived as a pdf, a pptx, a docx or an xlsx. Format-specific behaviour ENDS at the parser, and
// everything after it -- chunking, chunk rows, indexing, embedding, retrieval -- sees one shape.
//
// 🔴 THAT CLAIM DECAYS SILENTLY. A single `if (kind === "xlsx")` added downstream to fix one
// spreadsheet does not break a build, does not fail an existing test, and does not look wrong in
// review -- it looks like a fix. It is only visible later, as a format that chunks differently from
// every other format for no reason anybody remembers, and as a second special case added beside the
// first because the first made the file look like a place where special cases go.
//
// So this file checks the claim two ways, because neither half is sufficient alone:
//
//   1. STATICALLY -- the downstream modules contain no conditional keyed to a format name. This
//      catches a violation on a code path no fixture happens to exercise.
//   2. BEHAVIOURALLY -- four `ParsedDocument` values that differ ONLY in `kind` and in their units'
//      `Locator.kind` are pushed through the same downstream path, and every semantic property of
//      the result is asserted equal. This catches a leak the regex cannot see, including one that
//      arrives through a helper in another file.
//
// What is deliberately NOT scanned: `parse.ts` and the per-format parsers. Those ARE the boundary,
// and branching on format is precisely their job.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  chunkDocument,
  CHUNKER_VERSION,
  type DocBlock,
  type DocChunk,
  type DocCell,
  type DocKind,
  type DocTable,
  type DocUnit,
  type Locator,
  type ParsedDocument,
  type UnitKind,
} from "@nemesis/shared";

import { EMBEDDING_VERSION, sourceChunkRows, type PipelineVersions, type SourceChunkRow } from "./ingest-plan";

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — STATIC: no downstream module branches on a format name
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The modules that live AFTER the parser boundary. Adding a fourth is one line here.
 *
 * Paths are repo-root-relative, resolved the same way `apps/web/lib/workload-cost.test.ts` resolves
 * the files it reads, so the check keeps working from any working directory.
 */
const DOWNSTREAM_FILES = [
  "packages/shared/src/doc-chunk.ts",
  "apps/web/lib/notebooks/ingest-plan.ts",
  "apps/web/lib/notebooks/ingest-pipeline.ts",
] as const;

/**
 * Symbols that must survive comment-stripping, per file.
 *
 * 🔴 A STRIPPER THAT EATS THE CODE REPORTS ZERO VIOLATIONS AND LOOKS LIKE A PASS. These anchors are
 * the guard: if the state machine below ever mis-tracks a quote and swallows the rest of a file, the
 * anchors vanish and this test fails loudly instead of quietly certifying nothing.
 *
 * Keyed by the literal file list rather than by `string`, so adding a module to `DOWNSTREAM_FILES`
 * without giving it anchors is a compile error. A missing entry would otherwise scan that file with
 * a stripper nobody had verified and report zero findings — the same silent pass, one level up.
 */
const ANCHORS: Record<(typeof DOWNSTREAM_FILES)[number], readonly string[]> = {
  "packages/shared/src/doc-chunk.ts": ["chunkDocument", "estimateTokens", "CHUNKER_VERSION", "renderTableParts"],
  "apps/web/lib/notebooks/ingest-plan.ts": ["sourceChunkRows", "docKindFor", "planWork", "asParsedDocument"],
  "apps/web/lib/notebooks/ingest-pipeline.ts": ["ingestSource", "claimParse", "runChunk", "runEmbed"],
};

const repoFile = (path: string) => readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");

/**
 * Blank out comments, preserving every line break so a finding can name its line.
 *
 * 🔴 COMMENT STATE WINS OVER STRING STATE, AND THE ORDER OF THE CHECKS IS WHAT ENFORCES IT. These
 * files are dense with apostrophes inside prose comments -- "the unit's own trail", "a page's
 * PRINTED number" -- and doc-chunk.ts has a comment quoting `"812 | 4.1 | yes"`. A scanner that
 * looked for a quote before deciding whether it was inside a comment would flip into "in a string"
 * on the first apostrophe and mis-read every line after it. Dispatching on the CURRENT state first
 * makes quotes inert inside a comment, which is the only ordering that is correct.
 *
 * Known limitation, stated because it is real: regex literals are not tracked, so a literal
 * containing `//`, an unmatched quote or a comment opener would confuse this. The files in scope
 * contain exactly two regex literals (`/\s+/g` and `/\s/`) and neither has any of those, and the
 * anchor assertion above turns the failure into a red test rather than a false pass.
 */
function stripComments(source: string): string {
  type Mode = "code" | "line" | "block" | "single" | "double" | "template";
  let mode: Mode = "code";
  let out = "";

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i] ?? "";
    const next = source[i + 1];

    if (mode === "line") {
      if (ch === "\n") {
        mode = "code";
        out += "\n";
      } else out += " ";
      continue;
    }

    if (mode === "block") {
      if (ch === "*" && next === "/") {
        mode = "code";
        out += "  ";
        i += 1;
      } else out += ch === "\n" ? "\n" : " ";
      continue;
    }

    if (mode === "single" || mode === "double" || mode === "template") {
      // An escape consumes the character after it, so a `\"` never ends the literal.
      if (ch === "\\") {
        out += ch + (next ?? "");
        i += 1;
        continue;
      }
      const closer = mode === "single" ? "'" : mode === "double" ? '"' : "`";
      if (ch === closer) mode = "code";
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      mode = "line";
      out += "  ";
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      mode = "block";
      out += "  ";
      i += 1;
      continue;
    }
    if (ch === "'") mode = "single";
    else if (ch === '"') mode = "double";
    else if (ch === "`") mode = "template";
    out += ch;
  }

  return out;
}

/**
 * The four format names that mean one thing and nothing else.
 *
 * Kept separate from the full `DocKind` set on purpose: "image", "text" and "html" are ordinary
 * English words that appear as discriminants of unrelated unions -- doc-chunk.ts has
 * `{ type: "text" }` segments -- so comparing against them is only evidence of a format branch when
 * the other operand is visibly a kind. These four have no such second meaning anywhere in the tree.
 */
const FORMAT_NAMES = "pdf|pptx|docx|xlsx";

/**
 * Every `DocKind` plus every `UnitKind`, used only in the kind-anchored rules below.
 *
 * `UnitKind` belongs here because `locator.kind === "sheet"` is "is this an xlsx" spelled a
 * different way -- the leak wearing a disguise. No `BlockKind` member (heading, paragraph, listItem,
 * table, figure, caption, equation, code, quote, footnote, formField, speakerNotes, other) collides
 * with this list, which is why the anchored rules can safely include the generic-sounding entries.
 */
const KIND_LITERALS = "pdf|pptx|docx|xlsx|image|text|html|page|slide|sheet|section|document";

/** An expression whose tail identifier is a `kind`: `kind`, `docKind`, `doc.kind`, `chunk.locator.kind`. */
const KIND_EXPR = String.raw`\b(?:[\w$]+\s*\.\s*)*[\w$]*[Kk]ind\b`;

interface Rule {
  readonly name: string;
  /** What this catches, in one line, so a failure message explains itself. */
  readonly catches: string;
  readonly pattern: RegExp;
}

/**
 * What counts as a violation, and -- just as important -- what does not.
 *
 * ALLOWED, and none of these patterns match them:
 *   - a MAP from a kind to a parser or a mime type (`{ pdf: "pdf" }`, `Partial<Record<DocKind, …>>`,
 *     `deps.parsers[kind]`). That is the boundary doing its job: routing bytes to the one parser
 *     that can read them is the whole reason `DocKind` exists.
 *   - a type declaration listing the kinds (`type DocKind = "pdf" | "pptx" | …`). A union of names
 *     is a vocabulary, not a decision.
 *   - a kind appearing in an error message or a log line (`` `no parser wired for ${kind}` ``).
 *     Naming what failed is reporting, not behaviour.
 *   - anything inside a comment, which is why the stripper runs first.
 *
 * FORBIDDEN, and each pattern below catches one shape of it: a comparison, a switch, a `case`, or a
 * membership test that lets the format the bytes arrived in change what happens to them AFTER the
 * parse. The self-test further down runs both corpora through these rules, because a detector that
 * cannot fail is worse than no detector at all.
 *
 * 🔴 AND ONE VIOLATION NO PATTERN HERE CAN SEE, WHICH IS WHY THIS FILE HAS A SECOND HALF. A lookup
 * table from kind to BEHAVIOUR — `const TARGET_BY_KIND: Record<DocKind, number> = { pdf: 400,
 * xlsx: 200, … }` — is syntactically indistinguishable from the routing map above: no comparison, no
 * switch, no membership test. Only Part 2 catches it, and it catches it instantly, because the four
 * documents would then chunk differently. Neither half is sufficient alone.
 */
const RULES: readonly Rule[] = [
  {
    catches: `a comparison against a format name, e.g. if (x === "xlsx")`,
    name: "format-comparison",
    pattern: new RegExp(
      String.raw`(?:[!=]==?\s*(['"])(?:${FORMAT_NAMES})\1)|(?:(['"])(?:${FORMAT_NAMES})\2\s*[!=]==?)`,
    ),
  },
  {
    catches: `a comparison of a kind expression against any doc or unit kind, e.g. locator.kind === "sheet"`,
    name: "kind-comparison",
    pattern: new RegExp(
      String.raw`(?:${KIND_EXPR}\s*[!=]==?\s*(['"])(?:${KIND_LITERALS})\1)` +
        String.raw`|(?:(['"])(?:${KIND_LITERALS})\2\s*[!=]==?\s*${KIND_EXPR})`,
    ),
  },
  {
    catches: "a switch whose discriminant is a kind",
    name: "kind-switch",
    pattern: new RegExp(String.raw`\bswitch\s*\([^)]*${KIND_EXPR}[^)]*\)`),
  },
  {
    catches: `a case label naming a format, e.g. case "pptx":`,
    name: "format-case",
    pattern: new RegExp(String.raw`\bcase\s+(['"])(?:${FORMAT_NAMES})\1\s*:`),
  },
  {
    catches: `a membership test over format names, e.g. ["pdf", "docx"].includes(kind)`,
    name: "format-membership",
    pattern: new RegExp(
      String.raw`(?:\.\s*(?:includes|has|indexOf)\s*\(\s*(['"])(?:${FORMAT_NAMES})\1)` +
        String.raw`|(?:\[[^\]]*(['"])(?:${FORMAT_NAMES})\2[^\]]*\][^;\n]*\.\s*(?:includes|has|indexOf))`,
    ),
  },
];

interface Finding {
  rule: string;
  line: number;
  text: string;
}

/**
 * Run every rule over already-stripped source, WHOLE rather than a line at a time.
 *
 * 🔴 SCANNING LINE BY LINE MISSES THE BRANCH THE FORMATTER ITSELF WRITES. Prettier breaks a binary
 * expression after `===` once it no longer fits the print width, so a comparison with a long left
 * operand arrives as `structureForThisSource.kind ===` on one line and `"xlsx"` on the next. That is
 * the same violation as the one-liner, and a scanner that never sees the two halves together cannot
 * see it at all -- which would put the hole in the half whose entire job is catching a leak on a
 * code path no fixture exercises. The rules already put `\s*` between their parts, and a newline is
 * whitespace; that only pays off if the text they run over still has the newline in it.
 *
 * So the line number comes from the match's OFFSET rather than from a loop counter -- which works
 * because the stripper blanks comments in place instead of deleting them -- and a match that spans
 * lines is flattened before it is reported, so a failure message stays one readable line.
 *
 * 🔴 A FRESH GLOBAL COPY PER CALL, NEVER A SHARED ONE. A `g`-flagged regex carries `lastIndex`
 * between calls, so reusing one would start the second scan wherever the first stopped and quietly
 * miss findings -- the failure mode where a detector reports zero because it never looked.
 */
function findFormatBranches(strippedSource: string): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    for (const match of strippedSource.matchAll(new RegExp(rule.pattern, "g"))) {
      findings.push({
        line: strippedSource.slice(0, match.index ?? 0).split("\n").length,
        rule: rule.name,
        text: match[0].replace(/\s+/g, " ").trim(),
      });
    }
  }
  // Rule order is an implementation detail; line order is what a person reading a failure wants.
  return findings.sort((a, b) => a.line - b.line);
}

const describe = (findings: readonly Finding[]) =>
  findings.map((f) => `  line ${f.line} [${f.rule}]: ${f.text}`).join("\n");

test("the comment stripper leaves the code it is supposed to leave", () => {
  for (const path of DOWNSTREAM_FILES) {
    const source = repoFile(path);
    // A moved, renamed or stubbed file would otherwise pass every check below by having nothing in
    // it to fail on.
    assert.ok(source.length > 1_000, `${path} is suspiciously short (${source.length} chars)`);
    const stripped = stripComments(source);
    assert.equal(stripped.split("\n").length, source.split("\n").length, `${path}: line count changed`);
    for (const anchor of ANCHORS[path]) {
      assert.ok(stripped.includes(anchor), `${path}: stripping removed ${anchor} -- the stripper is broken`);
    }
  }
});

test("the detector flags every shape of format branching", () => {
  // Each snippet MUST be caught. They are the shapes a real regression would take: a threshold
  // changed for one format, a switch that grew a per-format arm, a "these formats are special" list.
  const violations = [
    `if (doc.kind === "xlsx") target = 200;`,
    `const wide = kind !== "pdf";`,
    `switch (doc.kind) { case "pptx": return 2; default: return 1; }`,
    `if (locator.kind === "sheet") rows.push(header);`,
    `if (chunk.locator.kind === "slide") skipOverlap = true;`,
    `if (["pdf", "docx"].includes(kind)) return chunkTight(doc);`,
    `if (SPECIAL.has("xlsx")) {}`,
    `return "pptx" === parsed.kind ? 1 : 2;`,
    `case "pdf":`,
    // 🔴 THE ONE THE FORMATTER WRITES, and the one a line-at-a-time scan cannot see. Nothing here is
    // hand-contrived: Prettier produces exactly this break once the left operand is long enough.
    `const target =\n  structureForThisSource.kind ===\n  "xlsx"\n    ? 200\n    : 400;`,
  ];
  for (const snippet of violations) {
    const findings = findFormatBranches(stripComments(snippet));
    assert.ok(findings.length > 0, `NOT CAUGHT: ${snippet}`);
  }
});

test("the detector allows routing, declarations, reporting and comments", () => {
  // Each snippet MUST be clean. A detector that fired on these would be un-live-with-able, and the
  // first thing anyone would do is delete it.
  const allowed = [
    `const EXTENSION_KINDS: Readonly<Record<string, DocKind>> = { pdf: "pdf", docm: "docx", xlsm: "xlsx" };`,
    `export type DocKind = "pdf" | "pptx" | "docx" | "xlsx" | "image" | "text" | "html";`,
    `parsers: Partial<Record<DocKind, DocumentParser>>;`,
    `const parser = kind ? deps.parsers[kind] : undefined;`,
    `return result({ contentHash, kind, error: \`no parser wired for \${kind}\` });`,
    `if (block.kind === "table") continue;`,
    `if (segment.type === "text") pack(segment.pieces);`,
    `if (mime.startsWith("image/")) return "image";`,
    `unit_kind: locator.kind,`,
    `// PDF -> page, PPTX -> slide, XLSX -> sheet, DOCX -> section.`,
    `/* if (kind === "xlsx") here would be a violation, but it is inside a comment. */`,
    `const closers = new Set(['"', "'"]); // the apostrophe that used to break the stripper`,
    // The other half of scanning whole text: two legitimate lines must not fuse into a match. An
    // ASSIGNMENT split across lines reads like a comparison to a careless pattern -- it is not one,
    // and `[!=]==?` needs two characters, so a lone `=` cannot start it.
    `const kind =\n  "xlsx";`,
    `unit_kind: locator.kind,\ncell_range: locator.range ?? null,`,
  ];
  for (const snippet of allowed) {
    const findings = findFormatBranches(stripComments(snippet));
    assert.equal(findings.length, 0, `FALSE POSITIVE on: ${snippet}\n${describe(findings)}`);
  }
});

test("the detector survives a real 700-line file and still catches a branch inside it", () => {
  // The synthetic corpus proves the regexes. This proves the whole pipeline -- stripper included --
  // on a file full of prose comments that mention every format by name, which is the only place the
  // format names legitimately appear today.
  const real = repoFile("packages/shared/src/doc-chunk.ts");
  assert.equal(findFormatBranches(stripComments(real)).length, 0);

  // Both spellings of the same leak, because the second one is what a formatter hands you and the
  // first version of this detector could not see it.
  const leaks = [
    `function leaked(doc: ParsedDocument) {\n  if (doc.kind === "xlsx") return 200;\n  return 400;\n}\n`,
    `function leakedWrapped(doc: ParsedDocument) {\n  if (\n    doc.kind ===\n    "xlsx"\n  ) return 200;\n  return 400;\n}\n`,
  ];
  for (const leak of leaks) {
    const findings = findFormatBranches(stripComments(`${real}\n${leak}`));
    assert.ok(findings.length > 0, `a format branch appended to the real file went undetected:\n${leak}`);
    assert.ok(findings.every((f) => f.line > real.split("\n").length - 1), "the finding is not the injected line");
  }
});

test("no downstream module branches on the format the bytes arrived in", () => {
  for (const path of DOWNSTREAM_FILES) {
    const findings = findFormatBranches(stripComments(repoFile(path)));
    assert.equal(
      findings.length,
      0,
      `${path} branches on file format after the parser boundary:\n${describe(findings)}\n\n` +
        `Format-specific behaviour belongs in the parser. If this is genuinely routing rather than a ` +
        `behaviour change, it belongs in a map, not a conditional.`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — BEHAVIOURAL: the same document, wearing four formats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The four formats under test, each with the unit subdivision doc-model.ts assigns it.
 *
 * These pairings are the contract: a pdf divides into pages, a pptx into slides, a docx into
 * sections, an xlsx into sheets. Everything else about the four documents below is IDENTICAL, so any
 * difference in the output is, by construction, the format leaking downstream.
 */
interface Format {
  readonly kind: DocKind;
  readonly unit: UnitKind;
}

const FORMATS: readonly Format[] = [
  { kind: "pdf", unit: "page" },
  { kind: "pptx", unit: "slide" },
  { kind: "docx", unit: "section" },
  { kind: "xlsx", unit: "sheet" },
];

/** One format's trip through the downstream path. Named rather than inferred so the baseline below
 *  can be narrowed by a plain guard: `assert.ok` is an assertion function, and TypeScript refuses to
 *  narrow through one unless the name it narrows carries an explicit type. */
interface ChunkRun {
  readonly format: Format;
  readonly chunks: readonly DocChunk[];
}

/**
 * Deliberately generic content: an access-and-maintenance schedule that would be at home in a lease,
 * an equipment manual, a facilities course pack or a compliance filing. Nothing in the chunker may
 * care what a document is about, so nothing in the fixture tells it.
 *
 * Long enough, and punctuated enough, that a tight token budget splits it several ways -- the packer
 * and the overlap logic are the parts most likely to acquire a special case, so they have to run.
 */
const PROSE = [
  "The occupier shall permit access on reasonable notice, save in an emergency, when no notice is required.",
  "Access is limited to the hours agreed in writing and to the areas identified in the attached schedule.",
  "Where access is refused, the party seeking it shall record the refusal and the reason given for it.",
  "A record kept under this clause shall be retained for six years and produced on request without charge.",
].join(" ");

const SECOND_PROSE = [
  "Any item found defective on inspection shall be reported within two working days of the inspection.",
  "The report shall state what was inspected, what was found, and what action the inspector recommends.",
  "Nothing in this clause obliges either party to carry out work that is not reasonably practicable.",
].join(" ");

const block = (id: string, text: string, extra: Partial<DocBlock> = {}): DocBlock => ({
  id,
  kind: "paragraph",
  method: "textLayer",
  ordinal: 0,
  text,
  ...extra,
});

const cell = (text: string, col: number, row: number, header = false): DocCell => ({
  col,
  header: header || undefined,
  row,
  text,
});

/** Reading order is array order unless a fixture says otherwise. */
const unit = (locator: Locator, blocks: DocBlock[]): DocUnit => ({
  blocks: blocks.map((b, i) => ({ ...b, ordinal: i })),
  locator,
});

/**
 * A table with a MEASURED range, given to every format equally.
 *
 * 🔴 THE RANGE IS THE SHARPEST PROBE IN THIS FILE. `cell_range` is the one provenance column that
 * only spreadsheets usually populate, so it is the column most likely to acquire an
 * `if (kind === "xlsx")` in front of it. doc-model.ts is explicit that a range may be "B12:F19", a
 * named range OR a table name -- so a pdf whose parser measured "Schedule A" is a legitimate parse,
 * and the row it produces must be identical to the spreadsheet's. If it ever is not, a format has
 * reached past the parser.
 *
 * The table is REFERENCED by a block inside a unit on purpose: an unreferenced table takes a
 * different path at the end of `chunkDocument` (its own locator, no unit seat), which would exercise
 * less of the code this test is about.
 */
const table = (unitKind: UnitKind): DocTable => ({
  id: "tbl-1",
  locator: { index: 1, kind: unitKind, range: "Schedule A" },
  method: "textLayer",
  rows: [
    [cell("Item", 0, 0, true), cell("Interval", 1, 0, true), cell("Responsible party", 2, 0, true)],
    [cell("Filters", 0, 1), cell("Quarterly", 1, 1), cell("Occupier", 2, 1)],
    [cell("Seals", 0, 2), cell("Annually", 1, 2), cell("Owner", 2, 2)],
    [cell("Alarm test", 0, 3), cell("Monthly", 1, 3), cell("Occupier", 2, 3)],
  ],
  title: "Schedule of inspections",
});

/**
 * One document, told to call itself a given format.
 *
 * 🔴 EVERY FIELD EXCEPT `kind` AND THE UNITS' `Locator.kind` IS HELD CONSTANT, INCLUDING THE ONES A
 * REAL PARSE WOULD VARY. A real xlsx unit would often carry a sheet name and no index; a real pdf
 * page would carry an index and no label. Both are given both here, because this test varies exactly
 * one thing and a fixture that varied two could not attribute a difference to either. The fixtures
 * are therefore more uniform than any real parse, and that is the point of them.
 */
function documentAs(kind: DocKind, unitKind: UnitKind): ParsedDocument {
  const units: DocUnit[] = [
    unit({ headingPath: ["Part I"], index: 1, kind: unitKind, label: "Access" }, [
      block("b1", "Access and inspection", { depth: 1, kind: "heading" }),
      block("b2", PROSE),
      block("b3", "Notice must be in writing.", { kind: "listItem" }),
      block("b4", "Emergencies are excepted.", { kind: "listItem" }),
      block("b5", "", { kind: "table", tableId: "tbl-1" }),
      block("b6", "The schedule above may be varied only by agreement in writing."),
    ]),
    unit({ headingPath: ["Part I"], index: 2, kind: unitKind, label: "Reporting" }, [
      block("b7", "Reporting defects", { depth: 2, kind: "heading" }),
      block("b8", SECOND_PROSE),
    ]),
  ];

  return {
    contentHash: "sha256-cross-format-fixture",
    coverage: {
      tablesFound: 1,
      unitsFound: units.length,
      unitsRead: units.length,
      visualsFound: 0,
      visualsKept: 0,
      visualsUnreadable: 0,
    },
    kind,
    parserVersion: "fixture@1",
    tables: [table(unitKind)],
    title: "Access and inspection schedule",
    units,
    visuals: [],
  };
}

/**
 * One versions object for all four runs.
 *
 * In production `versions.parser` genuinely differs per format, because a different parser really
 * did run. That is a fact about which parser produced the parse, not a chunking behaviour, so
 * varying it here would put `parser_version` in the differing-columns set and blur the one claim
 * this test makes.
 */
const VERSIONS: PipelineVersions = { chunker: CHUNKER_VERSION, embedding: EMBEDDING_VERSION, parser: "fixture@1" };

const USER_ID = "00000000-0000-0000-0000-0000000000aa";
const PARSED_DOCUMENT_ID = "00000000-0000-0000-0000-0000000000bb";

function rowsFor(kind: DocKind, unitKind: UnitKind, targetTokens?: number): SourceChunkRow[] {
  const doc = documentAs(kind, unitKind);
  const chunks = chunkDocument(doc, targetTokens === undefined ? {} : { overlapTokens: 8, targetTokens });
  return sourceChunkRows({
    chunks,
    parsedDocumentId: PARSED_DOCUMENT_ID,
    title: doc.title ?? "",
    userId: USER_ID,
    versions: VERSIONS,
  });
}

/** Which COLUMNS differ between two rows, by name. Values are compared structurally because
 *  `heading_path` is an array and two equal arrays are never `===`; collecting names rather than
 *  whole rows is what makes a failure say which column leaked. */
function differingColumns(a: SourceChunkRow, b: SourceChunkRow): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const key of keys) {
    const left = JSON.stringify((a as unknown as Record<string, unknown>)[key] ?? null);
    const right = JSON.stringify((b as unknown as Record<string, unknown>)[key] ?? null);
    if (left !== right) out.push(key);
  }
  return out.sort();
}

test("the same document chunks identically as pdf, pptx, docx and xlsx", () => {
  const runs: readonly ChunkRun[] = FORMATS.map((format) => ({
    chunks: chunkDocument(documentAs(format.kind, format.unit)),
    format,
  }));

  const baseline = runs[0];
  if (!baseline) throw new Error("no formats under test");
  // Four empty arrays are also identical. The fixture has to have produced something, and something
  // that went through both the prose packer and the table renderer.
  assert.ok(baseline.chunks.length >= 2, `fixture produced ${baseline.chunks.length} chunks`);
  assert.ok(
    baseline.chunks.some((chunk) => chunk.locator.range === "Schedule A"),
    "the table never reached the chunker, so the sharpest column is untested",
  );

  for (const run of runs.slice(1)) {
    // Annotated: it is read inside an `assert.ok` call, and TypeScript will not infer the type of a
    // name that an assertion function's own arguments depend on.
    const label: string = `${run.format.kind} vs ${baseline.format.kind}`;
    assert.equal(run.chunks.length, baseline.chunks.length, `${label}: different number of chunks`);

    run.chunks.forEach((chunk, index) => {
      const expected = baseline.chunks[index];
      assert.ok(expected, `${label}: no baseline chunk at ${index}`);
      assert.equal(chunk.text, expected.text, `${label}: chunk ${index} text differs`);
      assert.deepEqual(chunk.blockIds, expected.blockIds, `${label}: chunk ${index} block ids differ`);
      assert.equal(chunk.tokensEstimate, expected.tokensEstimate, `${label}: chunk ${index} token estimate differs`);
      assert.equal(chunk.chunkIndex, expected.chunkIndex, `${label}: chunk ${index} index differs`);
      // The locator is allowed to differ in exactly one field -- the one the format genuinely owns.
      const { kind: actualKind, ...actualRest } = chunk.locator;
      const { kind: expectedKind, ...expectedRest } = expected.locator;
      assert.equal(actualKind, run.format.unit, `${label}: chunk ${index} carries the wrong unit kind`);
      assert.equal(expectedKind, baseline.format.unit);
      assert.deepEqual(actualRest, expectedRest, `${label}: chunk ${index} locator differs beyond its kind`);
    });
  }
});

test("a tight token budget splits every format the same way", () => {
  // The default budget swallows this fixture in a handful of chunks. A small target forces the
  // packer, the overlap tail and the table's row-splitting to run, which is where a per-format
  // threshold would hide.
  const runs: readonly ChunkRun[] = FORMATS.map((format) => ({
    chunks: chunkDocument(documentAs(format.kind, format.unit), { overlapTokens: 8, targetTokens: 40 }),
    format,
  }));

  const baseline = runs[0];
  if (!baseline) throw new Error("no formats under test");
  assert.ok(baseline.chunks.length > 4, `a tight budget produced only ${baseline.chunks.length} chunks`);

  for (const run of runs.slice(1)) {
    assert.deepEqual(
      run.chunks.map((chunk) => chunk.text),
      baseline.chunks.map((chunk) => chunk.text),
      `${run.format.kind} splits differently from ${baseline.format.kind}`,
    );
    assert.deepEqual(
      run.chunks.map((chunk) => chunk.tokensEstimate),
      baseline.chunks.map((chunk) => chunk.tokensEstimate),
      `${run.format.kind} estimates tokens differently from ${baseline.format.kind}`,
    );
  }
});

test("chunk rows differ in unit_kind and in nothing else", () => {
  const runs: ReadonlyArray<{ format: Format; rows: SourceChunkRow[] }> = FORMATS.map((format) => ({
    format,
    rows: rowsFor(format.kind, format.unit),
  }));
  const baseline = runs[0];
  if (!baseline) throw new Error("no formats under test");
  assert.ok(baseline.rows.length >= 2, `fixture produced ${baseline.rows.length} rows`);

  // The columns that prove the interesting paths ran at all: without these, "identical" could mean
  // "identically empty".
  assert.ok(
    baseline.rows.some((row) => row.cell_range === "Schedule A"),
    "no row carries the measured range",
  );
  assert.ok(baseline.rows.some((row) => (row.heading_path?.length ?? 0) > 1), "no row carries a heading trail");
  assert.ok(baseline.rows.some((row) => row.unit_index === 2), "the second unit never produced a row");

  const leaked = new Set<string>();
  for (const run of runs.slice(1)) {
    assert.equal(run.rows.length, baseline.rows.length, `${run.format.kind}: different number of rows`);
    run.rows.forEach((row, index) => {
      const expected = baseline.rows[index];
      assert.ok(expected, `${run.format.kind}: no baseline row at ${index}`);
      assert.equal(row.unit_kind, run.format.unit, `${run.format.kind}: row ${index} carries the wrong unit kind`);
      for (const column of differingColumns(row, expected)) leaked.add(column);
    });
  }

  assert.deepEqual(
    [...leaked].sort(),
    ["unit_kind"],
    "a chunk row column other than unit_kind changed with the file format -- a format reached past the parser",
  );
});

test("the label, the range and the heading trail are copied, never gated on a format", () => {
  // Stated separately from the sweep above because these three are the columns a well-meaning
  // special case would guard: "only spreadsheets have a range", "only slides have a label". Each is
  // a MEASURED field of the locator, and the only question the pipeline may ask is whether the
  // parser put one there.
  for (const format of FORMATS) {
    const rows = rowsFor(format.kind, format.unit);
    const tableRow = rows.find((row) => row.cell_range !== null);
    assert.ok(tableRow, `${format.kind}: the measured range was dropped`);
    assert.equal(tableRow.cell_range, "Schedule A");
    assert.ok(
      rows.every((row) => row.unit_label === "Access" || row.unit_label === "Reporting"),
      `${format.kind}: a unit label was dropped`,
    );
    assert.ok(
      rows.every((row) => row.heading_path !== null && row.heading_path[0] === "Part I"),
      `${format.kind}: the parser's own heading trail was dropped`,
    );
  }
});
