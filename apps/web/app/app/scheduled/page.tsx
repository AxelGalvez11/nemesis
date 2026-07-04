"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createMission,
  deleteMission,
  fetchMissions,
  fetchWatches,
  setMissionStatus,
  setWatchStatus,
  type WatchSummary,
} from "@/lib/api";
import { cadenceLabel, timeUntil, type MissionCadence, type MissionSummary } from "@pharmabro/shared";
import { getCached, setCached } from "@/lib/cache";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";

// A suggestion fills the composer (mission templates) or links to Monitoring (the watch template).
interface Suggestion { emoji: string; title: string; question: string; cadence: MissionCadence; kind: "mission" | "watch"; }
const SUGGESTIONS: Suggestion[] = [
  { emoji: "🧪", title: "Weekly retatrutide trial watch", question: "What is the latest clinical trial evidence for retatrutide?", cadence: "weekly", kind: "mission" },
  { emoji: "📚", title: "Monthly GLP-1 evidence review", question: "Summarize new evidence on GLP-1 receptor agonists for weight loss", cadence: "monthly", kind: "mission" },
  { emoji: "🔎", title: "Weekly creatine cognition update", question: "Is there new evidence that creatine improves cognition?", cadence: "weekly", kind: "mission" },
  { emoji: "🛡️", title: "Daily FDA safety recall check", question: "New FDA drug safety recalls", cadence: "daily", kind: "watch" },
];

const CREATE_ERROR: Record<string, string> = {
  not_enabled: "Missions aren’t enabled for your account yet.",
  limit: "You’ve used all your scheduled runs — upgrade your plan for more.",
  duplicate: "You’ve already scheduled this exact research.",
  auth: "Sign in to schedule research.",
  unknown: "Couldn’t schedule that — try again.",
};

// Scheduled: one surface for everything that runs on a timer — background research MISSIONS (scheduled
// deep-research → cited reports) and evidence WATCHES (monitors that alert on new studies). Compose a new
// mission up top; below, missions and watches list together with their next-run / last-checked timing.
export default function ScheduledPage() {
  const router = useRouter();
  const [missions, setMissions] = useState<MissionSummary[] | null>(() => getCached<MissionSummary[]>("scheduled-missions") ?? null);
  const [watches, setWatches] = useState<WatchSummary[] | null>(() => getCached<WatchSummary[]>("scheduled-watches") ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [cadence, setCadence] = useState<MissionCadence>("weekly");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchMissions().then((m) => { if (alive) { setMissions(m); setCached("scheduled-missions", m); } }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load scheduled research."); });
    void fetchWatches().then((w) => { if (alive) { setWatches(w); setCached("scheduled-watches", w); } }).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function schedule() {
    const q = question.trim();
    if (!q || creating) return;
    setCreating(true);
    setNotice(null);
    setErr(null);
    try {
      const res = await createMission({ question: q, report_mode: "meta", cadence, deliver: "in_app" });
      if (res.ok) {
        setQuestion("");
        const fresh = await fetchMissions();
        setMissions(fresh);
        setCached("scheduled-missions", fresh);
        setNotice("Scheduled. It’ll run on its cadence and file a cited report.");
      } else {
        setNotice(CREATE_ERROR[res.reason] ?? "Couldn’t schedule that — try again.");
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn’t schedule that — try again.");
    } finally {
      setCreating(false);
    }
  }

  function applySuggestion(s: Suggestion) {
    if (s.kind === "watch") {
      // The safety-recall template is a MONITOR, not a research run — hand it to Monitoring's box.
      setCached("monitor-prefill", s.question.slice(0, 200));
      router.push("/app/monitor");
      return;
    }
    setQuestion(s.question);
    setCadence(s.cadence);
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

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <Orb size={52} />
        <h2 className="welcome-title">Scheduled</h2>
        <p className="welcome-sub">Set research to run on a schedule and monitors to watch for new evidence — the results land here and in your reports.</p>
      </div>

      {/* Compose a new scheduled mission */}
      <div className="watch-add" style={{ flexWrap: "wrap" }}>
        <Icon name="clock" size={16} />
        <input
          className="watch-add-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void schedule(); }}
          placeholder="Describe research to run on a schedule…"
          aria-label="Describe research to run on a schedule"
          disabled={creating}
        />
        <select className="mode" value={cadence} aria-label="Cadence" onChange={(e) => setCadence(e.target.value as MissionCadence)} disabled={creating}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button type="button" className="mode watch-add-btn" onClick={() => void schedule()} disabled={creating || !question.trim()}>
          {creating ? "Scheduling…" : "Schedule"}
        </button>
      </div>
      {notice ? <p className="tmpl-note">{notice}</p> : null}
      {err ? <p className="tmpl-note">{err}</p> : null}

      {/* Suggestion gallery — clicking fills the composer (or opens Monitoring for the watch template). */}
      <div className="chip-row welcome-chips" aria-label="Scheduling ideas">
        {SUGGESTIONS.map((s) => (
          <button key={s.title} type="button" className="chip-action" title={s.question} onClick={() => applySuggestion(s)}>
            <span aria-hidden>{s.emoji}</span> {s.title}
          </button>
        ))}
      </div>

      {loading ? <SkeletonRows count={3} label="Loading your schedule…" /> : null}

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

      {/* Watches */}
      {watches && watches.length > 0 ? (
        <section className="proj-section">
          <div className="proj-section-head"><h3><Icon name="bell" size={14} /> Monitors <small>{watches.length}</small></h3></div>
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

      {!loading && missions && missions.length === 0 && watches && watches.length === 0 ? (
        <p className="welcome-sub">Nothing scheduled yet. Describe research above, or start a monitor from <Link href="/app/monitor">Monitoring</Link>.</p>
      ) : null}
    </div>
  );
}
