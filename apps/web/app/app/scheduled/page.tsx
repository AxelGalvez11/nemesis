"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MissionCadence, MissionDeliver, MissionSummary } from "@pharmabro/shared";
import { cadenceLabel } from "@pharmabro/shared";
import { createMission, deleteMission, fetchMissions, setMissionStatus } from "@/lib/api";
import { getCached, setCached } from "@/lib/cache";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";

// Scheduled: the Manus-style "your scheduled research agents" page. Surfaces Missions (scheduled
// background Deep Research → cited deliverables) as a first-class workspace list — the data and full
// CRUD already live in lib/api.ts, this is the first UI home for them. Mirrors MonitorPage's structure
// (add-row + watch-card-list) and reuses the engine-step atoms for the plan strip.
const ADD_ERROR_COPY: Record<"not_enabled" | "limit" | "duplicate" | "auth" | "unknown", string> = {
  not_enabled: "Scheduled research isn't switched on yet.",
  limit: "You've reached your plan's scheduled-research limit.",
  duplicate: "You already have a scheduled research run for this question.",
  auth: "Sign in to schedule research.",
  unknown: "Couldn't schedule that — try again.",
};

const CADENCES: MissionCadence[] = ["daily", "weekly", "monthly"];
const DELIVERS: MissionDeliver[] = ["in_app", "email"];

/** "in 3h" / "in 2d" — a compact next-run label (future timestamps). */
function relNext(iso: string): string {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (!Number.isFinite(mins)) return "—";
  if (mins <= 0) return "due now";
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.round(hrs / 24)}d`;
}

/** "3h ago" / "2d ago" — a compact last-run label. */
function relPast(iso: string | null): string {
  if (!iso) return "not yet run";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function ScheduledPage() {
  const [missions, setMissions] = useState<MissionSummary[] | null>(() => getCached<MissionSummary[]>("missions") ?? null);
  const [err, setErr] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [cadence, setCadence] = useState<MissionCadence>("weekly");
  const [deliver, setDeliver] = useState<MissionDeliver>("in_app");
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; question: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMissions()
      .then((m) => { if (alive) { setMissions(m); setCached("missions", m); } })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load your scheduled research."); });
    return () => { alive = false; };
  }, []);

  async function create() {
    const q = question.trim();
    if (!q || creating) return;
    setCreating(true);
    setAddError(null);
    try {
      const res = await createMission({ question: q, report_mode: "standard", cadence, deliver });
      if (res.ok) {
        setQuestion("");
        const m = await fetchMissions().catch(() => null);
        if (m) { setMissions(m); setCached("missions", m); }
      } else {
        setAddError(ADD_ERROR_COPY[res.reason]);
      }
    } finally {
      setCreating(false);
    }
  }

  async function toggle(m: MissionSummary) {
    const status: "active" | "paused" = m.status === "active" ? "paused" : "active";
    await setMissionStatus(m.id, status).catch(() => {});
    const next = (missions ?? []).map((x) => (x.id === m.id ? { ...x, status } : x));
    setMissions(next);
    setCached("missions", next);
  }

  async function remove(id: string) {
    await deleteMission(id).catch(() => {});
    const next = (missions ?? []).filter((x) => x.id !== id);
    setMissions(next);
    setCached("missions", next);
  }

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <Orb size={52} />
        <h2 className="welcome-title">Scheduled</h2>
        <p className="welcome-sub">
          Your scheduled research agents. Each one re-runs Deep research on a cadence and delivers a
          freshly cited report — no need to ask again.
        </p>
      </div>

      <div className="watch-add">
        <Icon name="replay" size={16} />
        <input
          className="watch-add-input"
          value={question}
          onChange={(e) => { setQuestion(e.target.value); if (addError) setAddError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
          placeholder="What should we keep researching for you? — e.g. “semaglutide cardiovascular outcomes”"
          aria-label="New scheduled research question"
          disabled={creating}
        />
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value as MissionCadence)}
          aria-label="Cadence"
          disabled={creating}
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "6px 8px", fontSize: 12.5, fontFamily: "var(--font)" }}
        >
          {CADENCES.map((c) => <option key={c} value={c}>{cadenceLabel(c)}</option>)}
        </select>
        <select
          value={deliver}
          onChange={(e) => setDeliver(e.target.value as MissionDeliver)}
          aria-label="Delivery"
          disabled={creating}
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "6px 8px", fontSize: 12.5, fontFamily: "var(--font)" }}
        >
          {DELIVERS.map((d) => <option key={d} value={d}>{d === "in_app" ? "In app" : "Email"}</option>)}
        </select>
        <button type="button" className="mode watch-add-btn" onClick={() => void create()} disabled={creating || !question.trim()}>
          {creating ? "Scheduling…" : "Schedule"}
        </button>
      </div>
      {addError ? (
        <p className="watch-add-error">
          {addError}
          {addError.includes("limit") ? <> · <Link href="/app/billing">see plans</Link></> : null}
        </p>
      ) : null}

      {err ? <p className="tmpl-note">{err}</p> : null}
      {missions === null && !err ? <SkeletonRows count={3} label="Loading your scheduled research…" /> : null}

      {missions && missions.length === 0 ? (
        <p className="welcome-sub">
          Nothing scheduled yet. Ask a question above, or run a Deep research report from{" "}
          <Link href="/app/ask">Ask</Link> and press &ldquo;Repeat this research&rdquo; on the finished
          report to get a fresh one on a schedule.
        </p>
      ) : null}

      {missions && missions.length > 0 ? (
        <div className="research-history">
          <div className="watch-card-list">
            {missions.map((m) => {
              const paused = m.status === "paused";
              return (
                <div key={m.id} className="watch-card" title={m.question} style={{ flexWrap: "wrap" }}>
                  <span className={`watch-card-dot ${paused ? "paused" : "active"}`} aria-hidden />
                  <span className="watch-card-main">
                    <span className="watch-card-title">{m.question}</span>
                    <span className="watch-card-meta">
                      <span className={`watch-card-pill ${m.cadence === "daily" ? "daily" : ""}`}>
                        {cadenceLabel(m.cadence)}
                      </span>
                      <span>{paused ? "Paused" : `Next ${relNext(m.next_run_at)}`}</span>
                      <span>Last run {relPast(m.last_run_at)}</span>
                      {m.last_run_status === "skipped_quota" ? <span>· skipped (daily limit)</span> : null}
                      {m.last_run_status === "failed" ? <span>· last run failed</span> : null}
                    </span>

                    {/* Manus plan/checklist framing: reuses the same atoms as the live research-progress
                        panel, so a mission reads as a standing agent plan rather than a cron row. */}
                    <div className="engine-step-list compact" style={{ marginTop: 8 }}>
                      <div className="engine-step done">
                        <span className="engine-step-icon"><Icon name="check" size={11} /></span>
                        <span className="engine-step-copy"><span className="engine-step-label">Question set</span></span>
                      </div>
                      <div className={`engine-step ${paused ? "pending" : "done"}`}>
                        <span className="engine-step-icon"><Icon name="check" size={11} /></span>
                        <span className="engine-step-copy"><span className="engine-step-label">Searches {cadenceLabel(m.cadence).toLowerCase()}</span></span>
                      </div>
                      <div className={`engine-step ${m.last_saved_report_id ? "done" : "pending"}`}>
                        <span className="engine-step-icon"><Icon name="check" size={11} /></span>
                        <span className="engine-step-copy"><span className="engine-step-label">Cited report</span></span>
                      </div>
                      <div className={`engine-step ${m.last_saved_report_id ? "done" : "pending"}`}>
                        <span className="engine-step-icon"><Icon name="check" size={11} /></span>
                        <span className="engine-step-copy"><span className="engine-step-label">Deliver {m.deliver === "in_app" ? "in app" : "by email"}</span></span>
                      </div>
                    </div>
                  </span>

                  <span style={{ display: "flex", gap: 6, flex: "none" }}>
                    {m.last_saved_report_id ? (
                      <Link href={`/app/reports/${m.last_saved_report_id}`} className="chip-action">Latest report</Link>
                    ) : null}
                    <button type="button" className="chip-action" onClick={() => void toggle(m)}>
                      {m.status === "active" ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      className="chip-action"
                      onClick={() => setConfirmDelete({ id: m.id, question: m.question })}
                      aria-label={`Delete scheduled research: ${m.question}`}
                    >
                      Delete
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Delete-confirm dialog — mirrors AppShell's chat-delete confirm styling. */}
      {confirmDelete ? (
        <div className="confirm-overlay" role="presentation" onClick={() => setConfirmDelete(null)}>
          <div
            className="confirm-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-mission-title"
            aria-describedby="confirm-mission-body"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-mission-title" className="confirm-title">Delete this scheduled research?</h3>
            <p id="confirm-mission-body" className="confirm-body">
              &ldquo;{confirmDelete.question}&rdquo; will stop running and be permanently deleted. This can&apos;t be undone.
            </p>
            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" autoFocus onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                type="button"
                className="confirm-del"
                onClick={() => { const id = confirmDelete.id; setConfirmDelete(null); void remove(id); }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
