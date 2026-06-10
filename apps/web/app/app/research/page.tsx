"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ResearchReport } from "@pharmabro/shared";
import {
  type AskQuotaError,
  fetchResearchReport,
  fetchResearchReports,
  fetchResearchRun,
  type ResearchReportSummary,
  type ResearchRunRow,
  startResearch,
} from "@/lib/api";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { ResearchProgress } from "@/components/ResearchProgress";
import { ResearchReportView } from "@/components/ResearchReportView";

function isQuotaError(e: unknown): e is AskQuotaError {
  return e instanceof Error && "quota" in e;
}

type Phase = "idle" | "running" | "done" | "error";

export default function ResearchPageRoute() {
  return (
    <Suspense fallback={null}>
      <ResearchPage />
    </Suspense>
  );
}

function ResearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const qParam = params.get("q"); // a question handed off from the chat composer (auto-start)
  const rParam = params.get("r"); // a saved report to open

  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState("");
  const [input, setInput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<ResearchRunRow | null>(null);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [proGate, setProGate] = useState(false);
  const [history, setHistory] = useState<ResearchReportSummary[]>([]);
  const startedRef = useRef(false);

  const refreshHistory = useCallback(() => {
    void fetchResearchReports().then(setHistory).catch(() => {});
  }, []);
  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  const start = useCallback(async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setPhase("running");
    setReport(null);
    setRun(null);
    setErr(null);
    setProGate(false);
    setQuestion(text);
    try {
      const id = await startResearch(text);
      setRunId(id);
    } catch (e) {
      if (isQuotaError(e)) {
        const { limit, used, plan } = e.quota;
        setProGate(Number(limit) === 0);
        setErr(Number(limit) === 0
          ? `Deep research is a Pro feature — your ${plan} plan doesn't include it yet.`
          : `Daily deep-research limit reached (${used}/${limit}) on ${plan}.`);
      } else {
        setErr(e instanceof Error ? e.message : "Could not start research.");
      }
      setPhase("error");
    }
  }, []);

  // Poll the run row while it's in flight (no Realtime configured).
  useEffect(() => {
    if (phase !== "running" || !runId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      try {
        const row = await fetchResearchRun(runId);
        if (!alive) return;
        if (row) {
          setRun(row);
          if (row.status === "completed") {
            const rep = row.saved_report_id ? await fetchResearchReport(row.saved_report_id) : null;
            if (!alive) return;
            if (rep) { setReport(rep); setPhase("done"); refreshHistory(); return; }
            setErr("The report finished but could not be loaded."); setPhase("error"); return;
          }
          if (row.status === "failed") { setErr(row.error || "Research failed."); setPhase("error"); return; }
        }
      } catch { /* transient read error — keep polling */ }
      timer = setTimeout(tick, 1500);
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [phase, runId, refreshHistory]);

  // Open a saved report from ?r=<id>.
  useEffect(() => {
    if (!rParam) return;
    let alive = true;
    setPhase("running");
    setQuestion("");
    void fetchResearchReport(rParam)
      .then((rep) => {
        if (!alive) return;
        if (rep) { setReport(rep); setQuestion(rep.question); setPhase("done"); }
        else { setErr("Report not found."); setPhase("error"); }
      })
      .catch(() => { if (alive) { setErr("Could not load report."); setPhase("error"); } });
    return () => { alive = false; };
  }, [rParam]);

  // Auto-start a question handed off from the chat composer (?q=...), once.
  useEffect(() => {
    if (rParam || startedRef.current) return;
    if (qParam) { startedRef.current = true; void start(qParam); }
  }, [qParam, rParam, start]);

  const reset = () => {
    startedRef.current = true; // don't let ?q re-trigger after a manual reset
    setPhase("idle"); setReport(null); setRun(null); setRunId(null); setErr(null); setProGate(false); setQuestion(""); setInput("");
    router.replace("/app/research");
  };

  // ── idle: composer + history ──
  if (phase === "idle") {
    return (
      <div className="research-wrap">
        <div className="research-intro">
          <Orb size={52} />
          <h2 className="welcome-title">Deep research</h2>
          <p className="welcome-sub">A multi-step, fully cited report. I break your question into sub-questions, search the evidence for each, write the report, and fact-check every claim against its source.</p>
          <ResearchComposer input={input} setInput={setInput} onSubmit={() => start(input)} />
        </div>
        <ResearchHistory history={history} />
      </div>
    );
  }

  // ── running / done / error ──
  return (
    <div className="research-wrap">
      <div className="research-head">
        <button className="chip-action" onClick={reset}><Icon name="plus" size={14} />New deep research</button>
        {question ? <div className="research-q">{question}</div> : null}
      </div>

      {phase === "running" ? (
        <ResearchProgress steps={run?.progress ?? []} done={false} />
      ) : null}

      {phase === "error" ? (
        <div className="research-error">
          <p className="tmpl-note">{err}</p>
          {proGate ? (
            <Link href="/app/billing" className="chip-action"><Icon name="card" size={14} />See Pro plans</Link>
          ) : (
            <button className="chip-action" onClick={() => start(question || input)}><Icon name="sparkle" size={14} />Try again</button>
          )}
        </div>
      ) : null}

      {phase === "done" && report ? <ResearchReportView report={report} /> : null}

      {phase === "done" ? <ResearchHistory history={history} /> : null}
    </div>
  );
}

function ResearchComposer({ input, setInput, onSubmit }: { input: string; setInput: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="composer">
      <div className="box">
        <textarea
          rows={2}
          value={input}
          maxLength={1000}
          aria-label="Ask a deep-research question"
          placeholder="Ask a research question — e.g. 'What is the human evidence for tesamorelin's safety and efficacy?'"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
        />
        <div className="tools">
          <div className="spacer" />
          <button className="send" title="Run deep research" onClick={onSubmit} disabled={!input.trim()}>
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
      <div className="hint">⏎ to run · this takes longer than a chat answer · Pro feature</div>
    </div>
  );
}

function ResearchHistory({ history }: { history: ResearchReportSummary[] }) {
  if (history.length === 0) return null;
  return (
    <div className="research-history">
      <div className="ai-block-label">Your reports</div>
      <div className="research-history-list">
        {history.map((r) => (
          <Link key={r.id} href={`/app/research?r=${r.id}`} className="research-card" title={r.title}>
            <Icon name="doc" size={15} />
            <span className="research-card-title">{r.title}</span>
            <small>{r.citation_count} sources</small>
          </Link>
        ))}
      </div>
    </div>
  );
}
