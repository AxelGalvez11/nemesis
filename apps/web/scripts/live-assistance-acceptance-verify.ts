// Production acceptance, step 2 of 2: read rows back OUT of the live database and assert what they
// mean. See live-assistance-acceptance-emit.ts for the procedure.
//
// 🔴 NOTHING HERE RE-DERIVES A ROW. The input is whatever the database actually returned, and the
// only code it runs is the real read path — `evidenceFromRow`, `projectLearnerState`, `satisfies`.
// That is what makes this an acceptance test rather than a second unit test: the schema, the
// constraint and the projection all have to agree for these to pass.
import { readFileSync } from "node:fs";
import { evidenceFromRow } from "@/lib/learn/learner-store";
import { projectLearnerState, satisfies } from "@/lib/learn/learner-evidence";
import { summariseStrategy } from "@/lib/learn/strategy-outcomes";

const raw = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as Record<string, unknown>[];
const rows = raw.map((r) => evidenceFromRow(r, r.identity_key as string));
const by = (id: string) => rows.find((r) => r.taskId === id)!;

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

// ── COMPLETION: a real demonstration that is not unaided production ─────────
const completion = by("live-completion");
const completionState = projectLearnerState(completion.objectiveIdentityKey, rows);
check("completion survives the round trip as an assisted production",
  completion.scaffoldRung === "completion" && completion.taskForm === "completion",
  `rung=${completion.scaffoldRung} form=${completion.taskForm}`);
check("completion counts as a demonstration", completionState.status === "correct" && completionState.demonstrationCount === 1);
check("completion CANNOT satisfy unaided production", satisfies(completionState, "independent") === false);
check("completion does establish recognition", satisfies(completionState, "recognition") === true);

// ── INDEPENDENT: unaided production, and it does satisfy ────────────────────
const direct = by("live-direct");
const directState = projectLearnerState(direct.objectiveIdentityKey, rows);
check("independent answer survives as unaided production",
  direct.scaffoldRung === "independent" && direct.taskForm === "direct" && direct.scaffoldingLevel === 0);
check("independent answer satisfies unaided production", satisfies(directState, "independent") === true);

// ── RECOGNITION with options revealed: weaker, and stays weaker ─────────────
const recognised = by("live-recognised");
const recognisedState = projectLearnerState(recognised.objectiveIdentityKey, rows);
check("options-revealed answer is stored as recognition",
  recognised.scaffoldRung === "recognition" && recognised.scaffoldingLevel === 1);
check("options-revealed answer does NOT satisfy unaided production", satisfies(recognisedState, "independent") === false);
check("a stale replay could not upgrade it (one row survives, and it is the recognition one)",
  rows.filter((r) => r.taskId === "live-recognised").length === 1);

// ── Answered BEFORE the options were opened: credited as production ─────────
const before = by("live-before-reveal");
const beforeState = projectLearnerState(before.objectiveIdentityKey, rows);
check("answer given before the options were opened is stored as unaided production",
  before.scaffoldRung === "independent" && before.scaffoldingLevel === 0);
check("and it therefore satisfies unaided production", satisfies(beforeState, "independent") === true);
check("the two recognition-built prompts diverge exactly as the learner's behaviour did",
  recognised.scaffoldRung !== before.scaffoldRung);

// ── LEARNER-STATE PERSISTENCE ───────────────────────────────────────────────
const keys = [...new Set(rows.map((r) => r.objectiveIdentityKey))];
check("every objective read back its own state, with no fan-out", keys.length === 4 &&
  keys.every((k) => projectLearnerState(k, rows).evidenceCount === 1));
check("state is durable without a canvas — it is keyed on the objective",
  rows.every((r) => r.canvasId === null) && completionState.lastEvidenceAt !== null);

// ── measurement reaches the summary ─────────────────────────────────────────
const forms = summariseStrategy("llm_teacher", rows).taskForms;
check("the durable record can report per-form outcomes", forms.observed &&
  forms.byForm.completion.attempts === 1 && forms.byForm.direct.attempts === 3,
  `completion=${forms.byForm.completion.attempts} direct=${forms.byForm.direct.attempts}`);

console.log(failed === 0 ? "\nALL LIVE CHECKS PASSED" : `\n${failed} LIVE CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
