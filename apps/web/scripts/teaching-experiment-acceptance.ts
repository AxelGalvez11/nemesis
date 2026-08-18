/**
 * Production acceptance for both teaching-experiment arms.
 *
 * This is intentionally inert unless the operator supplies an exact confirmation and an explicit
 * source id. A run creates one temporary production learner, reads the selected parsed course
 * source, and makes paid model calls through the same controller boundary the Canvas uses. The
 * learner is deleted in `finally`, including when a check or model call fails.
 *
 * Usage, from apps/web:
 *
 *   PRODUCTION_ACCEPTANCE_CONFIRM="temporary-user-paid-model-calls-approved" \
 *   ACCEPTANCE_SOURCE_ID=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_KEY=... pnpm exec tsx scripts/teaching-experiment-acceptance.ts
 */
import { supabase } from "@/lib/supabase";
import type { ResolvedObjective } from "@/lib/learn/canvas-knowledge";
import { extractKnowledgeObjects } from "@/lib/learn/knowledge-extraction";
import type { StoredObjective } from "@/lib/learn/learner-store";
import { objectivesForKnowledge } from "@/lib/learn/learning-objective";
import { supportedObjectives } from "@/lib/learn/policy-runtime";
import { controllerFor } from "@/lib/learn/strategy-registry";
import { ASSIGNABLE_STRATEGIES, conflictingStrategy, resolveStrategy } from "@/lib/learn/teaching-strategy";
import type {
  StrategyOutcome,
  TeachingContext,
  TeachingStrategyId,
} from "@/lib/learn/teaching-strategy";
import { sourceContextFromModel } from "@/lib/sources/source-context";

const CONFIRMATION = "temporary-user-paid-model-calls-approved";

let failures = 0;
function check(id: string, pass: boolean, detail = ""): void {
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function describe(id: TeachingStrategyId, outcome: StrategyOutcome, tookMs: number): string {
  if (!outcome.decision) return `${id}: no decision (refusal=${outcome.refusal ?? "none"}, ${tookMs}ms)`;
  return `${id}: ${outcome.decision.action.type} → ${outcome.decision.objective.identityKey} (${tookMs}ms)`;
}

async function main(): Promise<void> {
  if (process.env.PRODUCTION_ACCEPTANCE_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Refusing production effects. Set PRODUCTION_ACCEPTANCE_CONFIRM=${CONFIRMATION} only after approval.`,
    );
  }

  const sb = required("NEXT_PUBLIC_SUPABASE_URL");
  const anon = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const service = required("SUPABASE_SERVICE_KEY");
  const sourceId = required("ACCEPTANCE_SOURCE_ID");
  const svc = {
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
  };

  let userId: string | null = null;
  try {
    const stamp = crypto.randomUUID();
    const email = `controller-${stamp}@nemesis.test`;
    const password = `Ctrl-${stamp}-Aa1!`;

    const createResponse = await fetch(`${sb}/auth/v1/admin/users`, {
      body: JSON.stringify({ email, email_confirm: true, password }),
      headers: svc,
      method: "POST",
    });
    const created = (await createResponse.json()) as { id?: string; user?: { id?: string } };
    userId = created.id ?? created.user?.id ?? null;
    if (!createResponse.ok || !userId) {
      throw new Error(`could not seed a learner: ${JSON.stringify(created).slice(0, 240)}`);
    }

    const tokenResponse = await fetch(`${sb}/auth/v1/token?grant_type=password`, {
      body: JSON.stringify({ email, password }),
      headers: { apikey: anon, "Content-Type": "application/json" },
      method: "POST",
    });
    const token = (await tokenResponse.json()) as { access_token?: string; refresh_token?: string };
    if (!tokenResponse.ok || !token.access_token || !token.refresh_token) {
      throw new Error(`could not sign the learner in: ${JSON.stringify(token).slice(0, 240)}`);
    }
    const { error } = await supabase.auth.setSession({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
    });
    if (error) throw new Error(`setSession failed: ${error.message}`);
    console.log(`learner      ${userId} (${email})`);

    const sourceResponse = await fetch(
      `${sb}/rest/v1/library_sources?id=eq.${encodeURIComponent(sourceId)}&select=parsed_document_id,file_name`,
      { headers: svc },
    );
    if (!sourceResponse.ok) throw new Error(`could not read selected source (${sourceResponse.status})`);
    const sourceRows = (await sourceResponse.json()) as {
      parsed_document_id: string | null;
      file_name: string;
    }[];
    const source = sourceRows[0];
    if (!source?.parsed_document_id) throw new Error(`selected source ${sourceId} has no parse`);

    const parsedResponse = await fetch(
      `${sb}/rest/v1/parsed_documents?id=eq.${encodeURIComponent(source.parsed_document_id)}&select=structure,doc_kind,parser_version`,
      { headers: svc },
    );
    if (!parsedResponse.ok) throw new Error(`could not read selected parse (${parsedResponse.status})`);
    const parsedRows = (await parsedResponse.json()) as {
      structure?: { model?: unknown };
      doc_kind?: string;
      parser_version?: string;
    }[];
    const parsed = parsedRows[0];
    const documentModel = parsed?.structure?.model;
    if (!documentModel) throw new Error("selected parse carries no document model");
    console.log(`material     ${source.file_name}`);
    console.log(`parser       ${parsed.parser_version ?? "unknown"}`);

    const context = sourceContextFromModel({
      model: documentModel,
      sourceId,
      sourceKind: parsed.doc_kind ?? "pdf",
    } as never);
    const knowledge = extractKnowledgeObjects(context).objects;
    const resolved: ResolvedObjective[] = knowledge.flatMap((item) =>
      objectivesForKnowledge(item).map((objective) => ({
        knowledge: item,
        objective: { ...objective, rowId: `probe-${objective.identityKey}` } as StoredObjective,
      })),
    );
    const staged = supportedObjectives(resolved);
    check(
      "MATERIAL",
      staged.length > 0,
      `${knowledge.length} knowledge objects → ${staged.length} stageable objectives`,
    );
    if (staged.length === 0) throw new Error("selected material has no stageable objectives");

    const teachingContext: TeachingContext = {
      attention: { activeMs: 4 * 60_000, availableMs: null },
      evidence: [],
      now: new Date(),
      objectives: staged,
      uid: userId,
    };
    const outcomes = new Map<TeachingStrategyId, StrategyOutcome>();

    for (const strategy of ["nemesis_policy", "llm_teacher"] as const) {
      const started = Date.now();
      const outcome = await controllerFor(strategy, teachingContext);
      const tookMs = Date.now() - started;
      outcomes.set(strategy, outcome);
      check(`${strategy}-DECISION`, Boolean(outcome.decision), describe(strategy, outcome, tookMs));
      check(
        `${strategy}-ATTRIBUTION`,
        outcome.strategy === strategy,
        `recorded as ${outcome.strategy}${outcome.refusal ? ` after ${outcome.refusal}` : ""}`,
      );
      if (outcome.decision) {
        check(
          `${strategy}-CHOSE-FROM-CANVAS`,
          staged.some((entry) => entry.objective.identityKey === outcome.decision?.objective.identityKey),
          `objective=${outcome.decision.objective.identityKey}`,
        );
      }
    }

    const structured = outcomes.get("nemesis_policy")?.decision;
    const model = outcomes.get("llm_teacher")?.decision;
    if (structured && model) {
      console.log(`\n  nemesis    ${structured.action.type} → ${structured.objective.label}`);
      console.log(`  llm        ${model.action.type} → ${model.objective.label}`);
      console.log(
        `  same move  ${structured.objective.identityKey === model.objective.identityKey && structured.action.type === model.action.type}`,
      );
    }

    // ── ASSIGNMENT, WHICH EVERYTHING ABOVE DELIBERATELY BYPASSES ────────────────────────────────
    //
    // 🔴 THE CHECKS ABOVE CALL `controllerFor` DIRECTLY, so they prove both arms OPERATE and that a
    // turn is attributed to the arm that chose it. They prove nothing about which arm a learner
    // would actually have been given, because they never ask. That is the half the experiment
    // cannot survive losing: a session that changes controller partway writes rows under two labels
    // — or worse under one — and nothing computed afterwards can find them, because there is
    // nothing wrong with any single row.
    const assignmentInputs = { canvasId: crypto.randomUUID(), learnerId: userId, override: null };

    // Stability. The mechanism is that assignment is DERIVED from (learner, canvas) rather than
    // stored, so a reload, a second tab and a remount are all literally this call. Repeating it is
    // the point: a version that held the arm in state would satisfy a single call too.
    const enrolled = resolveStrategy({ ...assignmentInputs, randomise: true });
    const stable = Array.from({ length: 50 }, () => resolveStrategy({ ...assignmentInputs, randomise: true }));
    check(
      "ASSIGNMENT-STABLE",
      stable.every((a) => a.strategy === enrolled.strategy && a.assignedBy === enrolled.assignedBy),
      `${enrolled.strategy} on all ${stable.length + 1} resolutions (${enrolled.assignedBy})`,
    );

    // 🔴 AND IT IS NOT STABLE BY BEING CONSTANT. A function that returned one arm for everybody
    // would pass the check above perfectly. Assignment has to actually vary across canvases, or
    // "stable" is describing a bug.
    const spread = new Set(
      Array.from({ length: 40 }, (_, index) =>
        resolveStrategy({ canvasId: `canvas-${index}`, learnerId: userId, override: null, randomise: true }).strategy,
      ),
    );
    check("ASSIGNMENT-VARIES", spread.size > 1, `${spread.size} distinct arms across 40 canvases`);

    // Eligibility. Randomisation admits only canvases created after the dated rollout instant, and
    // an anonymous session is excluded by construction — there is no learner to hold an outcome
    // against, so enrolling one would generate arm-labelled rows nothing can ever join to a person.
    check(
      "ASSIGNMENT-UNENROLLED-IS-DEFAULT",
      resolveStrategy({ ...assignmentInputs, randomise: false }).assignedBy === "default",
      `a canvas outside the rollout runs ${resolveStrategy({ ...assignmentInputs, randomise: false }).strategy}`,
    );
    check(
      "ASSIGNMENT-ANONYMOUS-EXCLUDED",
      resolveStrategy({ canvasId: assignmentInputs.canvasId, learnerId: null, override: null, randomise: true })
        .assignedBy === "default",
      "a session with no learner is not enrolled",
    );

    // No mid-session switching. `conflictingStrategy` is the product's own detector, run here over
    // rows built from the two decisions this run actually produced — so it is checked against real
    // arm labels rather than invented ones.
    //
    // 🔴 AND IT IS CALIBRATED IN PLACE, because a detector that never fires is indistinguishable
    // from a clean result. The poisoned canvas below must be caught; if it is not, the clean verdict
    // above it means nothing.
    const canvasId = assignmentInputs.canvasId;
    const rowFor = (strategy: TeachingStrategyId, id: string) =>
      ({
        canvasId,
        demonstrationObtained: true,
        id,
        objectiveIdentityKey: outcomes.get(strategy)?.decision?.objective.identityKey ?? "k",
        occurredAt: new Date().toISOString(),
        teachingStrategy: strategy,
        verdict: "understood",
      }) as never;

    const oneArm = [rowFor(enrolled.strategy, "e1"), rowFor(enrolled.strategy, "e2")];
    check(
      "NO-MID-SESSION-SWITCH",
      conflictingStrategy({ canvasId, evidence: oneArm, running: enrolled.strategy }) === null,
      `${oneArm.length} rows on one canvas, all ${enrolled.strategy}`,
    );

    const other = ASSIGNABLE_STRATEGIES.find((arm) => arm !== enrolled.strategy)!;
    check(
      "SWITCH-DETECTOR-FIRES",
      conflictingStrategy({
        canvasId,
        evidence: [...oneArm, rowFor(other, "e3")],
        running: enrolled.strategy,
      }) === other,
      `a canvas carrying both arms is reported as ${other}`,
    );

    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    await supabase.auth.signOut().catch(() => undefined);
    if (userId) {
      const cleanup = await fetch(`${sb}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        headers: svc,
        method: "DELETE",
      });
      if (!cleanup.ok) {
        process.exitCode = 1;
        console.error(`cleanup failed for temporary learner ${userId} (${cleanup.status})`);
      } else {
        console.log(`cleanup      deleted temporary learner ${userId}`);
      }
    }
  }
}

void main().catch((error: unknown) => {
  process.exitCode = 1;
  console.error("teaching experiment acceptance failed:", error instanceof Error ? error.message : error);
});
