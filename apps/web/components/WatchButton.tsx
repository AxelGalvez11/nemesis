"use client";

import { useState } from "react";
import Link from "next/link";
import { createWatch, type CreateWatchInput } from "@/lib/api";
import { watchTitleFromQuestion } from "@pharmabro/shared";
import { Icon } from "@/components/icons";

// The "Watch this" affordance on an answer: one click starts monitoring the question's topic (a weekly
// topic-watch, news on, by default — cadence/limits are refined by the tier-gating increment). Pre-deploy
// the backend table is absent, so createWatch returns reason:"not_enabled" and the button says so rather
// than failing. The watch is created from the QUESTION text (title/topic/query_terms); drug-name capture
// for openFDA label monitoring is a later refinement — the loud alerts (PubMed/CT.gov) don't need it.

type State =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "created"; id: string }
  | { kind: "error"; message: string; upgrade?: boolean };

const ERROR_COPY: Record<"not_enabled" | "limit" | "auth" | "unknown", string> = {
  not_enabled: "Monitoring isn’t switched on yet.",
  limit: "You’ve reached your plan’s watch limit.",
  auth: "Sign in to start watching.",
  unknown: "Couldn’t start watching — try again.",
};

type WatchButtonProps =
  | { kind: "topic"; question: string }
  | { kind: "saved_question"; question: string; savedReportId: string };

export function WatchButton(props: WatchButtonProps) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const label = props.kind === "saved_question" ? "Watch this report" : "Watch this topic";

  async function start() {
    if (state.kind === "creating") return;
    setState({ kind: "creating" });
    const q = props.question.trim();
    const title = watchTitleFromQuestion(q);
    const input: CreateWatchInput = props.kind === "saved_question"
      ? { kind: "saved_question", title, saved_report_id: props.savedReportId, query_terms: q }
      : { kind: "topic", title, topic: q, query_terms: q };
    const res = await createWatch(input);
    if (res.ok) setState({ kind: "created", id: res.id });
    else setState({ kind: "error", message: ERROR_COPY[res.reason], upgrade: res.reason === "limit" });
  }

  if (state.kind === "created") {
    return (
      <Link href={`/app/monitor/${state.id}`} className="chip-action watch-this-btn" title="View this watch">
        <Icon name="check" size={14} /> Watching
      </Link>
    );
  }

  return (
    <span className="watch-this">
      <button
        type="button"
        className="chip-action watch-this-btn"
        onClick={() => void start()}
        disabled={state.kind === "creating"}
        title="Monitor for new evidence"
      >
        <Icon name="bell" size={14} /> {state.kind === "creating" ? "Starting…" : label}
      </button>
      {state.kind === "error" ? (
        <span className="watch-this-note">
          {state.message}
          {state.upgrade ? <> <Link href="/app/billing">See plans</Link></> : null}
        </span>
      ) : null}
    </span>
  );
}
