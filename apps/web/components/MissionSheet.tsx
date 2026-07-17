"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MissionCadence, MissionDeliver } from "@nemesis/shared";
import { missionEntitlement } from "@nemesis/shared";
import { createMission, fetchEntitlements } from "@/lib/api";
import { Icon } from "@/components/icons";

const OUTCOME_COPY: Record<"not_enabled" | "limit" | "duplicate" | "auth" | "unknown", string> = {
  not_enabled: "Scheduled research isn’t switched on yet.",
  limit: "You’ve reached your plan’s scheduled-research limit.",
  duplicate: "This research is already scheduled — manage it under Monitoring.",
  auth: "Sign in to schedule research.",
  unknown: "Couldn’t schedule this — try again.",
};

/** "Repeat this research" — the clock-icon sheet (ChatGPT agent’s schedule affordance, our engine).
 *  Creates a research_missions row; the cron takes it from there. */
export function MissionSheet({ question, reportMode, onClose }: { question: string; reportMode: string; onClose: () => void }) {
  const [cadence, setCadence] = useState<MissionCadence>("weekly");
  const [deliver, setDeliver] = useState<MissionDeliver>("in_app");
  const [limit, setLimit] = useState<number | null>(null); // null = still loading entitlements
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null); // copy shown after attempt
  const [created, setCreated] = useState(false);
  const [batch, setBatch] = useState("");

  useEffect(() => {
    let alive = true;
    fetchEntitlements()
      .then((e) => { if (alive) setLimit(missionEntitlement(e).limit); })
      .catch(() => { if (alive) setLimit(0); });
    return () => { alive = false; };
  }, []);

  async function schedule() {
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      const questions = [question, ...batch.split("\n").map((s) => s.trim()).filter(Boolean)].slice(0, 10);
      let okCount = 0;
      let firstError: string | null = null;
      for (const q of questions) {
        const res = await createMission({ question: q, report_mode: reportMode, cadence, deliver });
        if (res.ok) okCount++;
        else if (res.reason === "limit") { firstError = OUTCOME_COPY.limit; break; } // cap reached — stop, don’t spam errors
        else if (!firstError) firstError = OUTCOME_COPY[res.reason];
      }
      if (okCount > 0) {
        setCreated(true);
        // Single question: restore rich confirmation aware of cadence and delivery
        if (questions.length === 1 && okCount === 1) {
          setOutcome(`Scheduled. A fresh report will land ${cadence === "daily" ? "every day" : cadence === "weekly" ? "every week" : "every month"} under Reports${deliver === "email" ? " — and in your inbox" : ""}.`);
        } else {
          // Batch: show count + error (if any)
          setOutcome(`Scheduled ${okCount} ${okCount === 1 ? "run" : "runs"}.${firstError ? ` ${firstError}` : ""}`);
        }
      } else {
        setOutcome(firstError ?? OUTCOME_COPY.unknown);
      }
    } finally {
      setBusy(false);
    }
  }

  const proGated = limit === 0;
  return (
    <div className="scope-card mission-sheet" role="dialog" aria-label="Repeat this research on a schedule">
      <div className="ai-block-label"><Icon name="sparkle" size={14} /> Repeat this research</div>
      {proGated ? (
        <>
          <p className="tmpl-note">Scheduled research is a Pro feature — reports re-run automatically and land in your library.</p>
          <div className="scope-actions">
            <Link href="/app/billing" className="chip-action"><Icon name="card" size={14} />See Pro plans</Link>
            <button type="button" className="chip-action" onClick={onClose}>Close</button>
          </div>
        </>
      ) : (
        <>
          <div className="chip-row">
            {(["daily", "weekly", "monthly"] as const).map((c) => (
              <button key={c} type="button" className={`chip-action${cadence === c ? " active" : ""}`} onClick={() => setCadence(c)}>
                {c === "daily" ? "Daily" : c === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
          <div className="chip-row">
            <button type="button" className={`chip-action${deliver === "in_app" ? " active" : ""}`} onClick={() => setDeliver("in_app")}>In-app only</button>
            <button type="button" className={`chip-action${deliver === "email" ? " active" : ""}`} onClick={() => setDeliver("email")}>Email me the report</button>
          </div>
          <details className="mission-batch">
            <summary className="muted-label" style={{ cursor: "pointer" }}>Schedule several at once</summary>
            <p className="tmpl-note">One question per line — each becomes its own scheduled research run (same cadence and delivery).</p>
            <textarea
              className="scope-input"
              rows={3}
              value={batch}
              aria-label="Additional questions to schedule, one per line"
              onChange={(e) => setBatch(e.target.value)}
              placeholder={"How does semaglutide compare with tirzepatide for weight loss?\nWhat is the current evidence on berberine for blood sugar?"}
            />
          </details>
          {outcome ? <p className="tmpl-note">{outcome}</p> : null}
          <div className="scope-actions">
            {created ? (
              <Link href="/app/monitor" className="chip-action"><Icon name="bell" size={14} />Manage in Monitoring</Link>
            ) : (
              <button type="button" className="chip-action" onClick={() => void schedule()} disabled={busy || limit === null}>
                <Icon name="send" size={14} />{busy ? "Scheduling…" : "Schedule"}
              </button>
            )}
            <button type="button" className="chip-action" onClick={onClose}>{created ? "Done" : "Cancel"}</button>
          </div>
        </>
      )}
    </div>
  );
}
