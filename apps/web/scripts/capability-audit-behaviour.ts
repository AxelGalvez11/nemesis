/**
 * STAGE 3 — WHAT THE TEACHING CONTROLLER ACTUALLY DOES, over real material, with simulated learners.
 *
 * 🔴 THE SCENARIOS VARY ONE THING AT A TIME. Same document, same objectives, same starting state;
 * only the learner's evidence and the attention budget change. Anything that differs between two
 * runs is therefore attributable to the input that differs, which is the only way a behavioural
 * claim survives being read back later.
 *
 * 🔴 SYNTHETIC EVIDENCE, REAL EVERYTHING ELSE. The evidence rows are constructed — that is what
 * "simulated learner" means — but they are the same shape the evaluator writes, and they are fed to
 * the real `controllerFor` reaching the real model through the real metered door. Nothing about the
 * decision path is stubbed.
 *
 * Usage, from apps/web:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... \
 *     pnpm exec tsx scripts/capability-audit-behaviour.ts
 */
import { supabase } from "@/lib/supabase";
import { extractKnowledgeObjects } from "@/lib/learn/knowledge-extraction";
import { sourceContextFromModel } from "@/lib/sources/source-context";
import { objectivesForKnowledge } from "@/lib/learn/learning-objective";
import { supportedObjectives } from "@/lib/learn/policy-runtime";
import { controllerFor } from "@/lib/learn/strategy-registry";
import { DEFAULT_STRATEGY } from "@/lib/learn/teaching-strategy";
import type { LearnerEvidence } from "@/lib/learn/learner-evidence";
import type { ResolvedObjective } from "@/lib/learn/canvas-knowledge";
import type { StoredObjective } from "@/lib/learn/learner-store";
import type { TeachingAct } from "@/lib/learn/attention-budget";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

/** The owner's real diabetes lecture. */
const SOURCE = "d00a28d9-633f-460d-8526-890162b1e9bb";
const TURNS = Number(process.env.AUDIT_TURNS ?? 8);

/**
 * Mirrors `ACTIONABLE` in policy-runtime.ts — the actions that put something on the learner's
 * screen. 🔴 COPIED DELIBERATELY: this audit must not import a private list and thereby agree with
 * the code by construction. If the two ever disagree, that disagreement is the finding.
 */
const RENDERABLE = ["retrieve", "show_correction", "contrast", "teach", "simplify"];

interface Turn {
  verb: string;
  objective: string;
  standing: string;
  renderable: boolean;
  ms: number;
  because: string;
  movedOn: number;
  strategy: string;
  refusal: string | null;
}

function evidenceRow(key: string, verdict: string | null, minutesAgo: number, obtained: boolean): LearnerEvidence {
  return {
    demonstrationObtained: obtained,
    evaluator: "audit",
    id: `audit-${key}-${minutesAgo}-${verdict ?? "none"}`,
    objectiveIdentityKey: key,
    occurredAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    verdict: verdict as LearnerEvidence["verdict"],
  } as LearnerEvidence;
}

async function main(): Promise<void> {
  const stamp = Math.random().toString(16).slice(2, 10);
  const email = `audit-${stamp}@nemesis.test`;
  const password = `Audit-${stamp}-${stamp}`;
  const created = (await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, email_confirm: true, password }),
    headers: svc,
    method: "POST",
  }).then((r) => r.json())) as { id?: string };
  if (!created.id) throw new Error("could not seed a learner");
  const token = (await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { apikey: ANON, "Content-Type": "application/json" },
    method: "POST",
  }).then((r) => r.json())) as { access_token?: string; refresh_token?: string };
  await supabase.auth.setSession({
    access_token: token.access_token!,
    refresh_token: token.refresh_token!,
  });

  const src = (await fetch(
    `${SB}/rest/v1/library_sources?id=eq.${SOURCE}&select=parsed_document_id,file_name`,
    { headers: svc },
  ).then((r) => r.json())) as { parsed_document_id: string; file_name: string }[];
  const parsed = (await fetch(
    `${SB}/rest/v1/parsed_documents?id=eq.${src[0].parsed_document_id}&select=structure,doc_kind`,
    { headers: svc },
  ).then((r) => r.json())) as { structure: { model: unknown }; doc_kind: string }[];

  const context = sourceContextFromModel({
    model: parsed[0].structure.model,
    sourceId: SOURCE,
    sourceKind: parsed[0].doc_kind,
  } as never);
  const knowledge = extractKnowledgeObjects(context).objects;
  const resolved: ResolvedObjective[] = knowledge.flatMap((k) =>
    objectivesForKnowledge(k).map((o) => ({
      knowledge: k,
      objective: { ...o, rowId: `audit-${o.identityKey}` } as StoredObjective,
    })),
  );
  const staged = supportedObjectives(resolved);
  const standingOf = (key: string): string =>
    staged.find((entry) => entry.objective.identityKey === key)?.knowledge.importance?.standing ?? "none";

  console.log(`material  ${src[0].file_name}`);
  console.log(`objectives ${staged.length}  (central ${staged.filter((e) => standingOf(e.objective.identityKey) === "central").length})`);
  console.log(`strategy  ${DEFAULT_STRATEGY}\n`);

  async function run(
    name: string,
    availableMs: number | null,
    evidenceFor: (turn: number, actedOn: readonly string[]) => LearnerEvidence[],
  ): Promise<Turn[]> {
    if (process.env.AUDIT_ONLY && !name.startsWith(process.env.AUDIT_ONLY)) return [];
    console.log(`\n──── ${name} ────`);
    const turns: Turn[] = [];
    const actedOn: string[] = [];
    const recentActs: TeachingAct[] = [];
    let activeMs = Number(process.env.AUDIT_START_ACTIVE_MS ?? 0);
    for (let turn = 0; turn < TURNS; turn += 1) {
      if (process.env.AUDIT_SPACING_MS && turn > 0) {
        await new Promise((resolve) => setTimeout(resolve, Number(process.env.AUDIT_SPACING_MS)));
      }
      activeMs += 90_000; // a minute and a half per interaction, the observed order of magnitude
      const started = Date.now();
      const outcome = await controllerFor(DEFAULT_STRATEGY, {
        actedOn,
        attention: { activeMs, availableMs },
        evidence: evidenceFor(turn, actedOn),
        now: new Date(),
        objectives: staged,
        recentActs,
        uid: created.id!,
      });
      const ms = Date.now() - started;
      for (const moved of outcome.movedOn ?? []) actedOn.push(moved.objectiveIdentityKey);
      const decision = outcome.decision;
      if (!decision) {
        console.log(`  ${turn + 1}. (no decision) refusal=${outcome.refusal} strategy=${outcome.strategy} ${ms}ms`);
        turns.push({
          because: "",
          movedOn: outcome.movedOn?.length ?? 0,
          ms,
          objective: "",
          refusal: outcome.refusal ?? null,
          renderable: false,
          standing: "",
          strategy: outcome.strategy,
          verb: "(none)",
        });
        continue;
      }
      const key = decision.objective.identityKey;
      actedOn.push(key);
      recentActs.push({ action: decision.action.type, atMs: Date.now(), objectiveIdentityKey: key });
      const row: Turn = {
        because: "because" in decision.action ? String(decision.action.because) : "",
        movedOn: outcome.movedOn?.length ?? 0,
        ms,
        objective: decision.objective.label.slice(0, 46),
        refusal: null,
        renderable: RENDERABLE.includes(decision.action.type),
        standing: standingOf(key),
        strategy: outcome.strategy,
        verb: decision.action.type,
      };
      turns.push(row);
      const rationale = decision.rationale as { by?: string; after?: string };
      const fell = rationale.by === "nemesis_policy_fallback" ? `  🔴 FELL BACK after "${rationale.after}"` : "";
      console.log(
        `  ${turn + 1}. ${row.verb.padEnd(15)} ${row.renderable ? "  " : "🔴"} ${row.standing.padEnd(11)} ` +
          `passed-over ${String(row.movedOn).padStart(2)}  ${String(ms).padStart(5)}ms  ${row.objective}${fell}`,
      );
      if (row.because) console.log(`      "${row.because.slice(0, 108)}"`);
    }
    return turns;
  }

  // The objective the struggling learner keeps missing — the first one, whatever it is.
  const stuckKey = staged[0].objective.identityKey;

  const scenarios: Record<string, Turn[]> = {};

  scenarios["A · NEARLY OUT OF TIME (18 of 20 min spent), answering correctly"] = await run(
    "A · NEARLY OUT OF TIME (18 of 20 min spent), answering correctly",
    20 * 60_000,
    (_turn, acted) => acted.map((key, index) => evidenceRow(key, "strong", index + 1, true)),
  );

  scenarios["B · THREE HOURS LEFT, answering correctly"] = await run(
    "B · THREE HOURS LEFT, answering correctly",
    180 * 60_000,
    (_turn, acted) => acted.map((key, index) => evidenceRow(key, "strong", index + 1, true)),
  );

  scenarios["C · THE DRILL TRAP — failing the same objective every time"] = await run(
    "C · THE DRILL TRAP — failing the same objective every time",
    30 * 60_000,
    (turn) =>
      Array.from({ length: turn + 1 }, (_, index) =>
        evidenceRow(`${stuckKey}`, "incorrect", index + 1, true),
      ).map((row, index) => ({ ...row, id: `stuck-${index}` })),
  );

  scenarios["D · everything already demonstrated"] = await run(
    "D · everything already demonstrated",
    60 * 60_000,
    () => staged.map((entry, index) => evidenceRow(entry.objective.identityKey, "strong", index + 2, true)),
  );

  console.log("\n\n════ WHAT DIFFERED ════\n");
  const verbs = (turns: Turn[]): string =>
    Object.entries(
      turns.reduce<Record<string, number>>((sum, t) => ({ ...sum, [t.verb]: (sum[t.verb] ?? 0) + 1 }), {}),
    )
      .map(([verb, count]) => `${verb}×${count}`)
      .join(" ");
  for (const [name, turns] of Object.entries(scenarios)) {
    const unrenderable = turns.filter((t) => t.verb !== "(none)" && !t.renderable).length;
    const fallback = turns.filter((t) => t.strategy !== "llm_teacher").length;
    const passed = turns.reduce((sum, t) => sum + t.movedOn, 0);
    const median = [...turns.map((t) => t.ms)].sort((a, b) => a - b)[Math.floor(turns.length / 2)];
    console.log(`${name}`);
    console.log(`   verbs: ${verbs(turns)}`);
    console.log(
      `   passed over ${passed} · unrenderable decisions ${unrenderable} · fallback turns ${fallback} · median ${median}ms\n`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error("behaviour audit failed:", error);
  process.exit(1);
});
