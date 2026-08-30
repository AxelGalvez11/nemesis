"use client";

// DEV-ONLY PREVIEW — the course map, mounted for real.
//
// 🔴 THE REAL COMPONENT, REAL EVIDENCE, REAL DOCKING. `CourseMap` claims the side panel here exactly
// as it does on a canvas, so what this page shows is the surface reflowing around it rather than a
// picture of a panel. The plan and the evidence rows are fixtures; every class on them is shipped.
//
// 🔴 WHY THIS PAGE EXISTS AT ALL: `session.coursePlan` comes from the session hook rather than from
// the stored canvas, so a course canvas cannot be seeded through `localStorage` the way
// `/dev-preview/learn` seeds everything else. Without this the map could only be looked at by
// generating a real course against a real account.
//
// Two fields, on a switch, because the map has to hold a subject that is not a sequence — the
// design test in CLAUDE.md, made checkable by eye.

import { useState } from "react";

import { CourseMap } from "@/components/workspace/learn/course-map";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import type { PlanTerritory } from "@/lib/learn/curriculum-plan";
import type { EvidenceVerdict, LearnerEvidence } from "@/lib/learn/learner-evidence";

const node = (label: string, keys: string[], children?: PlanTerritory[], reachable = true): PlanTerritory => ({
  identityKeys: keys,
  label,
  reachable,
  ...(children ? { children } : {}),
});

const THERMO: readonly PlanTerritory[] = [
  node("Systems and state", [], [
    node("Systems, surroundings, boundaries", ["t.sys"]),
    node("State variables", ["t.state"]),
    node("Equilibrium", ["t.eq"]),
  ]),
  node("The first law", [], [
    node("Internal energy", ["t.u"]),
    node("Work and heat", ["t.wq"]),
    node("Enthalpy", ["t.h"]),
    node("Heat capacity", ["t.c"]),
  ]),
  node("The second law", [], [
    node("Entropy", ["t.s"]),
    node("Reversibility", ["t.rev"]),
    node("Carnot cycles", ["t.carnot"], undefined, false),
  ]),
  node("Free energy", [], [node("Helmholtz and Gibbs", ["t.g"]), node("Spontaneity", ["t.spon"])]),
  node("Phase equilibria", [], [node("Phase diagrams", ["t.pd"]), node("Clausius-Clapeyron", ["t.cc"])]),
];

const LAW: readonly PlanTerritory[] = [
  node("Formation", [], [node("Offer", ["l.offer"]), node("Acceptance", ["l.acc"]), node("Certainty of terms", ["l.cert"])]),
  node("Consideration", [], [
    node("Benefit and detriment", ["l.ben"]),
    node("Past consideration", ["l.past"]),
    node("Promissory estoppel", ["l.est"]),
  ]),
  node("Intention to create relations", [], [node("Commercial agreements", ["l.comm"]), node("Domestic agreements", ["l.dom"])]),
  node("Terms", [], [node("Express and implied", ["l.exp"]), node("Exclusion clauses", ["l.excl"])]),
  node("Vitiating factors", [], [node("Misrepresentation", ["l.mis"]), node("Duress", ["l.dur"])]),
];

let n = 0;
function ev(key: string, verdict: EvidenceVerdict | null, obtained = true): LearnerEvidence {
  n += 1;
  return {
    demonstrationObtained: obtained,
    id: `preview-${n}`,
    objectiveIdentityKey: key,
    occurredAt: `2026-08-29T09:00:${String(n).padStart(2, "0")}.000Z`,
    verdict,
  };
}

/** A chapter finished, one underway, the rest untouched — the state the bar exists to show. */
const EVIDENCE: readonly LearnerEvidence[] = [
  ev("t.sys", "strong"), ev("t.state", "strong"), ev("t.eq", "strong"),
  ev("t.u", "strong"), ev("t.wq", "incorrect"), ev("t.h", null, false),
  ev("t.s", "incorrect"),
  ev("l.offer", "strong"), ev("l.acc", "strong"), ev("l.cert", "strong"),
  ev("l.ben", "strong"), ev("l.past", "incorrect"),
  ev("l.comm", "incorrect"),
];

export default function CourseMapPreviewPage() {
  const [field, setField] = useState<"thermo" | "law">("thermo");
  const [open, setOpen] = useState(true);
  const [focused, setFocused] = useState<string | null>("Work and heat");

  const plan = field === "thermo" ? THERMO : LAW;
  const title = field === "thermo" ? "Thermodynamics" : "Contract Law";

  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <div className="relative h-full overflow-y-auto p-10">
          <div className="mx-auto flex max-w-(--canvas-column) flex-col gap-4">
            <h1 className="text-[length:var(--canvas-text-title)] font-medium text-(--ui-text-primary)">
              {title}
            </h1>
            <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">
              The surface reflows around the docked map rather than being covered by it. Focused
              section: {focused ?? "none"}.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-md border border-(--ui-stroke-secondary) px-3 py-1.5 text-[length:var(--canvas-text-small)] text-(--ui-text-primary)"
                onClick={() => setField(field === "thermo" ? "law" : "thermo")}
                type="button"
              >
                Switch field
              </button>
              <button
                className="rounded-md border border-(--ui-stroke-secondary) px-3 py-1.5 text-[length:var(--canvas-text-small)] text-(--ui-text-primary)"
                onClick={() => setOpen((was) => !was)}
                type="button"
              >
                {open ? "Close the map" : "Open the map"}
              </button>
            </div>
          </div>
          {open && (
            <CourseMap
              activeLabel={focused}
              evidence={EVIDENCE}
              onClose={() => setOpen(false)}
              onPick={(scope) => setFocused(scope.label)}
              plan={plan}
              title={title}
            />
          )}
        </div>
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
