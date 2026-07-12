"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createMission,
  deleteMission,
  fetchMissions,
  fetchWatches,
  setMissionStatus,
  setWatchStatus,
  type WatchSummary,
} from "@/lib/api";
import { cadenceLabel, nextRunAt, timeUntil, type MissionCadence, type MissionSummary } from "@pharmabro/shared";
import { getCached, setCached } from "@/lib/cache";
import { Icon, type IconName } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";
import { AppModal } from "@/components/AppModal";

// A suggestion row pre-fills the create-task modal (Manus's 3 full-width suggestion rows). All three are
// research missions — the one thing this composer actually creates. The watch/monitor entry point is a
// separate, honest affordance (a real link to /app/monitor) rather than a faked "suggestion" row, since a
// monitor is a different backing feature than a mission and can't be created from this modal.
interface Suggestion { icon: IconName; title: string; question: string; cadence: MissionCadence; }
const SUGGESTIONS: Suggestion[] = [
  { icon: "monitor", title: "Set up automated monitoring for any drug, trial, or condition.", question: "What is the latest clinical trial evidence for retatrutide?", cadence: "weekly" },
  { icon: "list", title: "Get a weekly summary of new evidence on a topic you're tracking.", question: "Summarize new evidence on GLP-1 receptor agonists for weight loss", cadence: "weekly" },
  { icon: "pipeline", title: "Turn a one-off research question into a recurring cited report.", question: "Is there new evidence that creatine improves cognition?", cadence: "monthly" },
];

const CREATE_ERROR: Record<string, string> = {
  not_enabled: "Missions aren’t enabled for your account yet.",
  limit: "You’ve used all your scheduled runs — upgrade your plan for more.",
  duplicate: "You’ve already scheduled this exact research.",
  auth: "Sign in to schedule research.",
  unknown: "Couldn’t schedule that — try again.",
};

type ScheduledTab = "calendar" | "tasks";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A concrete day a mission is projected to run, and which mission it belongs to. Built forward-only from
// each active mission's next_run_at (never backward — we have no record it ran before then).
interface DayHit { mission: MissionSummary; date: Date; }

// Local-day bucket key so grid cells and projected runs are compared in the same (local) frame.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Project active missions across the visible grid window [gridStart, gridEnd]. Steps by real cadence math
// (nextRunAt — the same function the scheduler uses) so projected days match what would actually run.
function projectMissions(missions: MissionSummary[], gridStart: Date, gridEnd: Date): Map<string, DayHit[]> {
  const byDay = new Map<string, DayHit[]>();
  const endMs = gridEnd.getTime();
  for (const m of missions) {
    if (m.status !== "active") continue;
    let cur = new Date(m.next_run_at);
    if (Number.isNaN(cur.getTime())) continue;
    // Walk forward from next_run_at; bounded by the last visible cell (+ a safety cap on iterations).
    for (let i = 0; i < 400 && cur.getTime() <= endMs; i++) {
      if (cur.getTime() >= gridStart.getTime()) {
        const key = dayKey(cur);
        const list = byDay.get(key) ?? [];
        list.push({ mission: m, date: new Date(cur) });
        byDay.set(key, list);
      }
      cur = nextRunAt(m.cadence, cur);
    }
  }
  return byDay;
}

// The 6-week (42-cell) grid covering the given month, Sunday-first. Cells are local Dates; start/end are
// returned alongside so the projection window is derived without indexing a possibly-undefined element.
function buildMonthGrid(viewMonth: Date): { cells: Date[]; start: Date; end: Date } {
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const start = new Date(firstOfMonth);
  start.setDate(1 - firstOfMonth.getDay()); // back up to the Sunday on/before the 1st
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  const end = new Date(start);
  end.setDate(start.getDate() + 41);
  return { cells, start, end };
}

// The small calendar-grid-with-a-plus-badge illustration for the empty state (Manus's anatomy, our own
// CSS/SVG — no external image). Purely decorative.
function ScheduleIllustration() {
  return (
    <div className="sched-empty-art" aria-hidden="true">
      <svg viewBox="0 0 120 100" width="120" height="100" fill="none">
        <rect x="6" y="14" width="94" height="78" rx="10" className="sched-art-frame" />
        <path d="M6 34h94" className="sched-art-frame" />
        <path d="M30 6v16M76 6v16" className="sched-art-frame" strokeLinecap="round" />
        {[0, 1, 2, 3].map((row) =>
          [0, 1, 2, 3].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={18 + col * 21}
              y={46 + row * 12}
              width={13}
              height={7}
              rx={2}
              className={row === 1 && col === 2 ? "sched-art-cell active" : "sched-art-cell"}
            />
          )),
        )}
      </svg>
      <span className="sched-empty-badge"><Icon name="plus" size={18} /></span>
    </div>
  );
}

// New scheduled task — the Manus-style create dialog. The only fields kept are ones the mission API
// actually persists: the research prompt (missions have no separate title field), cadence, and delivery.
// No time-of-day, expiration, or advanced-settings controls: MissionSummary/createMission carry no such
// fields, and inventing unsaved UI would be dishonest per the capture spec's mapping notes.
function CreateTaskModal({
  open,
  onClose,
  initial,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initial: { question: string; cadence: MissionCadence } | null;
  onCreated: (notice: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [cadence, setCadence] = useState<MissionCadence>("weekly");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuestion(initial?.question ?? "");
    setCadence(initial?.cadence ?? "weekly");
    setErr(null);
  }, [open, initial]);

  async function save() {
    const q = question.trim();
    if (!q || creating) return;
    setCreating(true);
    setErr(null);
    try {
      const res = await createMission({ question: q, report_mode: "meta", cadence, deliver: "in_app" });
      if (res.ok) {
        onCreated("Scheduled. It’ll run on its cadence and file a cited report.");
        onClose();
      } else {
        setErr(CREATE_ERROR[res.reason] ?? "Couldn’t schedule that — try again.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t schedule that — try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppModal open={open} onClose={onClose} title="New scheduled task" sub="Runs on its cadence and files a cited report here.">
      <div className="sched-form">
        <label className="sched-field">
          <span className="sched-field-label">Prompt</span>
          <textarea
            className="scope-input"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Summarize new evidence on GLP-1 receptor agonists for weight loss"
            aria-label="Research prompt to run on a schedule"
            disabled={creating}
            autoFocus
          />
        </label>
        <label className="sched-field">
          <span className="sched-field-label">Cadence</span>
          <select
            className="scope-input sched-select"
            value={cadence}
            aria-label="Cadence"
            onChange={(e) => setCadence(e.target.value as MissionCadence)}
            disabled={creating}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        {err ? <p className="tmpl-note">{err}</p> : null}
        <div className="confirm-actions sched-modal-actions">
          <button type="button" className="confirm-cancel" onClick={onClose} disabled={creating}>Cancel</button>
          <button type="button" className="mode watch-add-btn" onClick={() => void save()} disabled={creating || !question.trim()}>
            {creating ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </AppModal>
  );
}

// Scheduled: one surface for everything that runs on a timer — background research MISSIONS (scheduled
// deep-research → cited reports) and evidence WATCHES (monitors that alert on new studies). A "New
// scheduled task" modal creates missions; below, missions and watches list together with their
// next-run / last-checked timing.
export default function ScheduledPage() {
  const [missions, setMissions] = useState<MissionSummary[] | null>(() => getCached<MissionSummary[]>("scheduled-missions") ?? null);
  const [watches, setWatches] = useState<WatchSummary[] | null>(() => getCached<WatchSummary[]>("scheduled-watches") ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Tabs default to "calendar" on both server and first client render (avoids a hydration flip); the saved
  // preference is applied in an effect below. Calendar leads (Manus order); Tasks is second.
  const [tab, setTab] = useState<ScheduledTab>("calendar");
  // Calendar: which month the grid shows, and which day (if any) the user has selected. viewMonth is a
  // day-1 anchor; selectedDay is a local-day key.
  const [viewMonth, setViewMonth] = useState<Date>(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPrefill, setModalPrefill] = useState<{ question: string; cadence: MissionCadence } | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchMissions().then((m) => { if (alive) { setMissions(m); setCached("scheduled-missions", m); } }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load scheduled research."); });
    void fetchWatches().then((w) => { if (alive) { setWatches(w); setCached("scheduled-watches", w); } }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Restore the saved tab after mount (reading localStorage during render would desync SSR/CSR).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("scheduled-tab");
      if (saved === "calendar" || saved === "tasks") setTab(saved);
    } catch { /* localStorage unavailable — keep default */ }
  }, []);

  function selectTab(next: ScheduledTab) {
    setTab(next);
    try { localStorage.setItem("scheduled-tab", next); } catch { /* ignore persistence failure */ }
  }

  function openCreate(prefill?: { question: string; cadence: MissionCadence }) {
    setNotice(null);
    setModalPrefill(prefill ?? null);
    setModalOpen(true);
  }

  async function handleCreated(msg: string) {
    setNotice(msg);
    const fresh = await fetchMissions().catch(() => null);
    if (fresh) { setMissions(fresh); setCached("scheduled-missions", fresh); }
  }

  async function toggleMission(m: MissionSummary) {
    const next: "active" | "paused" = m.status === "active" ? "paused" : "active";
    const optimistic = (missions ?? []).map((x) => (x.id === m.id ? { ...x, status: next } : x));
    setMissions(optimistic);
    setCached("scheduled-missions", optimistic);
    try {
      await setMissionStatus(m.id, next);
    } catch {
      const fresh = await fetchMissions().catch(() => null);
      if (fresh) { setMissions(fresh); setCached("scheduled-missions", fresh); }
    }
  }

  async function removeMission(id: string) {
    const optimistic = (missions ?? []).filter((x) => x.id !== id);
    setMissions(optimistic);
    setCached("scheduled-missions", optimistic);
    try {
      await deleteMission(id);
    } catch {
      const fresh = await fetchMissions().catch(() => null);
      if (fresh) { setMissions(fresh); setCached("scheduled-missions", fresh); }
    }
  }

  async function toggleWatch(w: WatchSummary) {
    const next = w.status === "active" ? "paused" : "active";
    const optimistic = (watches ?? []).map((x) => (x.id === w.id ? { ...x, status: next } : x));
    setWatches(optimistic);
    setCached("scheduled-watches", optimistic);
    try {
      await setWatchStatus(w.id, next as "active" | "paused");
    } catch {
      const fresh = await fetchWatches().catch(() => null);
      if (fresh) { setWatches(fresh); setCached("scheduled-watches", fresh); }
    }
  }

  const loading = missions === null && watches === null && !err;
  const isEmpty = !loading && (missions?.length ?? 0) === 0 && (watches?.length ?? 0) === 0;

  // Calendar projection (Calendar tab only): the visible 6-week grid + active missions projected onto it.
  const { cells: gridCells, start: gridStart, end: gridEnd } = buildMonthGrid(viewMonth);
  const hitsByDay = projectMissions(missions ?? [], gridStart, gridEnd);
  const todayKey = dayKey(new Date());
  const monthHasHits = hitsByDay.size > 0;
  const selectedHits = selectedDay ? (hitsByDay.get(selectedDay) ?? []) : [];
  const selectedFirst = selectedHits[0] ?? null;

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <h2 className="welcome-title">Scheduled</h2>
        <p className="welcome-sub">Set research to run on a schedule and monitors to watch for new evidence — the results land here and in your reports.</p>
      </div>

      {/* Manus-style header tabs: Calendar (month grid of upcoming runs) / Tasks (the lists). The create
          trigger sits alongside the tabs (not inside one tab's body) so it stays reachable no matter
          which tab is active — including Calendar, which is the default. */}
      <div className="sched-tabs-row">
        <div className="sched-tabs" role="tablist" aria-label="Scheduled views">
          <button type="button" role="tab" aria-selected={tab === "calendar"} className={`ev-tab${tab === "calendar" ? " active" : ""}`} onClick={() => selectTab("calendar")}>
            <Icon name="calendar" size={14} /> Calendar
          </button>
          <button type="button" role="tab" aria-selected={tab === "tasks"} className={`ev-tab${tab === "tasks" ? " active" : ""}`} onClick={() => selectTab("tasks")}>
            <Icon name="clock" size={14} /> Tasks
          </button>
        </div>
        {!loading && !isEmpty ? (
          <button type="button" className="mode watch-add-btn sched-new-btn" onClick={() => openCreate()}>
            <Icon name="plus" size={16} /> New scheduled task
          </button>
        ) : null}
      </div>

      {notice ? <p className="tmpl-note">{notice}</p> : null}
      {err ? <p className="tmpl-note">{err}</p> : null}

      {loading ? <SkeletonRows count={3} label="Loading your schedule…" /> : null}

      {isEmpty ? (
        /* Shared empty state (both tabs): illustration + honest H2 + 3 suggestion rows + create button. */
        <div className="sched-empty">
          <ScheduleIllustration />
          <h2 className="sched-empty-title">Nemesis researches on schedule, within the scope you set.</h2>
          <div className="sched-suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                type="button"
                className="sched-suggestion-row"
                onClick={() => openCreate({ question: s.question, cadence: s.cadence })}
              >
                <Icon name={s.icon} size={18} />
                <span className="sched-suggestion-text">{s.title}</span>
                <Icon name="chevron-right" size={16} />
              </button>
            ))}
          </div>
          <p className="sched-empty-monitor">
            Looking to watch for new safety signals instead? <Link href="/app/monitor">Start a monitor</Link>.
          </p>
          <button type="button" className="mode watch-add-btn sched-empty-cta" onClick={() => openCreate()}>
            <Icon name="plus" size={16} /> Create your scheduled task
          </button>
        </div>
      ) : tab === "tasks" ? (
        <>
          {/* Missions */}
          {missions && missions.length > 0 ? (
            <section className="proj-section">
              <div className="proj-section-head"><h3><Icon name="clock" size={14} /> Scheduled research <small>{missions.length}</small></h3></div>
              <div className="watch-card-list">
                {missions.map((m) => (
                  <div key={m.id} className="watch-card proj-item">
                    <span className="watch-card-main" style={{ flex: 1 }}>
                      <span className="watch-card-title">{m.question}</span>
                      <span className="watch-card-meta">
                        {cadenceLabel(m.cadence)} · {m.status === "active" ? timeUntil(m.next_run_at) : "paused"}
                        {m.last_saved_report_id ? <> · <Link href={`/app/reports/${m.last_saved_report_id}`}>latest report</Link></> : null}
                      </span>
                    </span>
                    <button type="button" className="proj-remove" onClick={() => void toggleMission(m)}>{m.status === "active" ? "Pause" : "Resume"}</button>
                    <button type="button" className="proj-remove" onClick={() => void removeMission(m.id)}>Delete</button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Watches. Monitoring left the sidebar (Scheduled is the one automation surface), so this
              section carries the create entry point into the monitor picker. */}
          {watches && watches.length > 0 ? (
            <section className="proj-section">
              <div className="proj-section-head">
                <h3><Icon name="bell" size={14} /> Monitors <small>{watches.length}</small></h3>
                <Link href="/app/monitor" className="chip-action">+ New monitor</Link>
              </div>
              <div className="watch-card-list">
                {watches.map((w) => (
                  <div key={w.id} className="watch-card proj-item">
                    <Link href={`/app/monitor/${w.id}`} className="proj-item-link" title={w.title}>
                      <span className="watch-card-main">
                        <span className="watch-card-title">{w.title}</span>
                        <span className="watch-card-meta">
                          {w.cadence} · {w.last_checked_at ? `last checked ${new Date(w.last_checked_at).toLocaleDateString()}` : "not checked yet"}
                        </span>
                      </span>
                    </Link>
                    <button type="button" className="proj-remove" onClick={() => void toggleWatch(w)}>{w.status === "active" ? "Pause" : "Resume"}</button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        /* Calendar tab: a month grid of when active missions next run. Markers are projected forward from
           each mission's next_run_at by its real cadence — built from live data, never fabricated. */
        <div className="sched-cal">
          <div className="sched-cal-head">
            <span className="sched-cal-month">{MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}</span>
            <div className="sched-cal-nav">
              <button type="button" className="sched-cal-btn" aria-label="Previous month" onClick={() => { setSelectedDay(null); setViewMonth((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1)); }}>‹</button>
              <button type="button" className="sched-cal-today" onClick={() => { const n = new Date(); setSelectedDay(null); setViewMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Today</button>
              <button type="button" className="sched-cal-btn" aria-label="Next month" onClick={() => { setSelectedDay(null); setViewMonth((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1)); }}>›</button>
            </div>
          </div>

          <div className="sched-cal-grid" role="grid">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="sched-cal-dow" role="columnheader">{w}</div>
            ))}
            {gridCells.map((cell) => {
              const key = dayKey(cell);
              const hits = hitsByDay.get(key) ?? [];
              const inMonth = cell.getMonth() === viewMonth.getMonth();
              const isToday = key === todayKey;
              const isSelected = key === selectedDay;
              const cls = ["sched-cal-cell", inMonth ? "" : "muted", isToday ? "today" : "", isSelected ? "selected" : "", hits.length ? "has-hits" : ""].filter(Boolean).join(" ");
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  className={cls}
                  aria-label={`${cell.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${hits.length ? ` — ${hits.length} scheduled` : ""}`}
                  onClick={() => setSelectedDay((cur) => (cur === key ? null : key))}
                >
                  <span className="sched-cal-num">{cell.getDate()}</span>
                  {hits.length > 0 ? (
                    <span className="sched-cal-marks">
                      {hits.slice(0, 2).map((h, i) => (
                        <span key={`${h.mission.id}-${i}`} className="sched-cal-mark" title={h.mission.question}>{h.mission.question}</span>
                      ))}
                      {hits.length > 2 ? <span className="sched-cal-more">+{hits.length - 2} more</span> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {selectedFirst ? (
            <div className="sched-cal-day">
              <h3 className="sched-cal-day-head">{new Date(selectedFirst.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h3>
              <div className="watch-card-list">
                {selectedHits.map((h, i) => (
                  <div key={`${h.mission.id}-${i}`} className="watch-card proj-item">
                    <span className="watch-card-main" style={{ flex: 1 }}>
                      <span className="watch-card-title">{h.mission.question}</span>
                      <span className="watch-card-meta">{cadenceLabel(h.mission.cadence)}{h.mission.last_saved_report_id ? <> · <Link href={`/app/reports/${h.mission.last_saved_report_id}`}>latest report</Link></> : null}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!monthHasHits ? <p className="sched-cal-empty">Nothing scheduled this month.</p> : null}
        </div>
      )}

      <CreateTaskModal open={modalOpen} onClose={() => setModalOpen(false)} initial={modalPrefill} onCreated={(msg) => void handleCreated(msg)} />
    </div>
  );
}
