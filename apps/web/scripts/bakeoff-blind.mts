/**
 * Turn the two retrieval paths into a BLIND worksheet, and score what comes back.
 *
 * 🔴 THE ANSWERER MUST NOT KNOW WHICH PARSER PRODUCED THE CONTEXT. Everything
 * about this comparison is contested — it is the whole point of the exercise —
 * and a grader who can see "this came from the new lane" will find the new lane
 * better. So each question's two contexts are labelled `x` and `y`, the
 * assignment is decided per question by a hash of its id rather than a fixed
 * rule, and the mapping lives in a separate file the answerer never sees.
 *
 * Deterministic on purpose: the same worksheet regenerates identically, so a
 * disputed result can be re-scored rather than re-argued. A random shuffle would
 * make the run unreproducible and the label order itself unauditable.
 *
 * Scoring is MECHANICAL, not another model's opinion. An answer counts as right
 * when it contains the ground-truth answer or one of its stated variants, and it
 * is separately flagged when it contains the `common_wrong_answer` — the
 * specific wrong thing a structure-blind reader says. That second signal is the
 * valuable one: "got it wrong" is weak evidence, "produced exactly the error a
 * flattened table causes" is strong evidence.
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-blind.mts sheet <answers.jsonl> <questions.jsonl> <worksheet.jsonl> <key.jsonl>
 *   npx tsx scripts/bakeoff-blind.mts score <replies.jsonl> <key.jsonl> <questions.jsonl> <report.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

interface Question {
  id: string;
  name: string;
  archetype: string;
  question: string;
  answer: string;
  answer_variants?: string[];
  common_wrong_answer?: string;
  structure_dependent?: boolean;
  expects_disclosure?: boolean;
  confidence?: string;
}

interface AnswerRow {
  kind: string;
  id?: string;
  archetype?: string;
  baseline?: { match: string; context: string; citationCorrect: boolean | null; chunksSpanned: number };
  routed?: { match: string; context: string; citationCorrect: boolean | null; chunksSpanned: number };
}

const readJsonl = <T,>(p: string): T[] =>
  readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);

/** A stable per-question coin. Not random — reproducible, and auditable. */
function flip(id: string): boolean {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) & 1) === 1;
}

/** Contexts get a hard ceiling so one enormous chunk cannot crowd out the other
 *  side's. Applied identically to both, or it would be a thumb on the scale. */
const CONTEXT_CAP = 6_000;

function sheet(answersPath: string, questionsPath: string, worksheetPath: string, keyPath: string) {
  const answers = readJsonl<AnswerRow>(answersPath).filter((r) => r.kind === "question");
  const questions = new Map(readJsonl<Question>(questionsPath).map((q) => [q.id, q]));

  const worksheet: unknown[] = [];
  const key: unknown[] = [];
  for (const row of answers) {
    const q = row.id ? questions.get(row.id) : undefined;
    if (!q || !row.baseline || !row.routed) continue;
    const swap = flip(q.id);
    const asX = swap ? row.routed : row.baseline;
    const asY = swap ? row.baseline : row.routed;
    for (const [label, side] of [["x", asX], ["y", asY]] as const) {
      worksheet.push({
        row: `${q.id}-${label}`,
        question: q.question,
        // An empty context is a legitimate input, not a row to drop: "the
        // evidence never reached a chunk" must be allowed to produce a wrong or
        // refused answer rather than being quietly excluded from the score.
        context: side.context.slice(0, CONTEXT_CAP),
      });
    }
    key.push({
      id: q.id,
      x: swap ? "routed" : "baseline",
      y: swap ? "baseline" : "routed",
      baselineMatch: row.baseline.match,
      routedMatch: row.routed.match,
      baselineCitation: row.baseline.citationCorrect,
      routedCitation: row.routed.citationCorrect,
      baselineSpanned: row.baseline.chunksSpanned,
      routedSpanned: row.routed.chunksSpanned,
    });
  }
  writeFileSync(worksheetPath, worksheet.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(keyPath, key.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`worksheet rows: ${worksheet.length} (${key.length} questions, 2 contexts each)`);
}

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}%./-]+/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Does the reply contain this expected answer? Percentages and bare numbers are
 *  treated as the same token so "20%" matches a reply that says "20 percent". */
function contains(reply: string, expected: string): boolean {
  const r = norm(reply);
  const e = norm(expected);
  if (!e) return false;
  if (r.includes(e)) return true;
  const bare = e.replace(/%/g, "").replace(/\bpercent\b/g, "").trim();
  return bare.length > 0 && r.replace(/%/g, "").replace(/\bpercent\b/g, "").includes(bare);
}

function score(repliesPath: string, keyPath: string, questionsPath: string, reportPath: string) {
  const replies = new Map(
    readJsonl<{ row: string; answer: string }>(repliesPath).map((r) => [r.row, r.answer ?? ""]),
  );
  const key = readJsonl<{
    id: string;
    x: "routed" | "baseline";
    y: "routed" | "baseline";
    baselineMatch: string;
    routedMatch: string;
    baselineCitation: boolean | null;
    routedCitation: boolean | null;
  }>(keyPath);
  const questions = new Map(readJsonl<Question>(questionsPath).map((q) => [q.id, q]));

  const per: Record<string, { right: number; wrong: number; predictedWrong: number; refused: number; n: number }> = {
    baseline: { right: 0, wrong: 0, predictedWrong: 0, refused: 0, n: 0 },
    routed: { right: 0, wrong: 0, predictedWrong: 0, refused: 0, n: 0 },
  };
  const byArchetype: Record<string, Record<string, { right: number; n: number }>> = {};
  const rows: unknown[] = [];

  for (const k of key) {
    const q = questions.get(k.id);
    if (!q) continue;
    for (const label of ["x", "y"] as const) {
      const path = k[label];
      const reply = replies.get(`${k.id}-${label}`) ?? "";
      const expected = [q.answer, ...(q.answer_variants ?? [])];
      const right = expected.some((e) => contains(reply, e));
      // 🔴 A REFUSAL IS NOT A WRONG ANSWER. "The context does not say" from a
      // path whose chunk never received the evidence is the CORRECT behaviour,
      // and scoring it as a wrong answer would credit a path for confabulating.
      const refused = !right && /\b(not (stated|given|specified|say|mention)|does not (say|state|contain|mention)|cannot (tell|determine|answer)|no information|unable to)\b/i.test(reply);
      const predictedWrong = Boolean(q.common_wrong_answer) && contains(reply, q.common_wrong_answer!);
      const bucket = per[path]!;
      bucket.n += 1;
      if (right) bucket.right += 1;
      else if (refused) bucket.refused += 1;
      else bucket.wrong += 1;
      if (predictedWrong) bucket.predictedWrong += 1;

      byArchetype[q.archetype] ??= { baseline: { right: 0, n: 0 }, routed: { right: 0, n: 0 } };
      byArchetype[q.archetype]![path]!.n += 1;
      if (right) byArchetype[q.archetype]![path]!.right += 1;

      rows.push({ id: k.id, path, archetype: q.archetype, right, refused, predictedWrong, reply: reply.slice(0, 300) });
    }
  }

  const evidence = {
    baseline: {
      intact: key.filter((k) => k.baselineMatch === "exact" || k.baselineMatch === "tokens").length,
      split: key.filter((k) => k.baselineMatch === "split").length,
      absent: key.filter((k) => k.baselineMatch === "absent").length,
      citedRight: key.filter((k) => k.baselineCitation === true).length,
      citedWrong: key.filter((k) => k.baselineCitation === false).length,
    },
    routed: {
      intact: key.filter((k) => k.routedMatch === "exact" || k.routedMatch === "tokens").length,
      split: key.filter((k) => k.routedMatch === "split").length,
      absent: key.filter((k) => k.routedMatch === "absent").length,
      citedRight: key.filter((k) => k.routedCitation === true).length,
      citedWrong: key.filter((k) => k.routedCitation === false).length,
    },
  };

  const report = { answers: per, byArchetype, evidence, questions: key.length, rows };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ answers: per, evidence }, null, 2));
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "sheet" && rest.length === 4) sheet(rest[0]!, rest[1]!, rest[2]!, rest[3]!);
else if (mode === "score" && rest.length === 4) score(rest[0]!, rest[1]!, rest[2]!, rest[3]!);
else {
  console.error("usage: bakeoff-blind.mts sheet <answers> <questions> <worksheet> <key>");
  console.error("   or: bakeoff-blind.mts score <replies> <key> <questions> <report.json>");
  process.exit(2);
}
