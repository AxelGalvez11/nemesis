"use client";

import { useState } from "react";
import Link from "next/link";
import { createWatch, type CreateWatchInput } from "@/lib/api";
import { watchTitleFromQuestion } from "@pharmabro/shared";
import { Icon } from "@/components/icons";

// The "Watch this" affordance: one click starts monitoring a topic (a weekly topic-watch, news on, by
// default — cadence/limits are refined by the tier-gating increment). Pre-deploy the backend table is
// absent, so createWatch returns reason:"not_enabled" and the button says so rather than failing.
//
// Two callers:
//  • Ask answer  → { kind: "topic", question }  — title/topic/query_terms all derive from the QUESTION.
//  • Drug page   → { kind: "topic", question: drugName, title, mentions, label, existingWatchId } — the
//    drug's name(s) flow into `mentions` so openFDA label monitoring is scoped to the drug, and
//    `existingWatchId` (looked up by the caller) flips the button straight to "Watching" so a returning
//    user can't silently create a DUPLICATE watch and burn their plan limit.

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
  | { kind: "topic"; question: string; title?: string; mentions?: string[]; label?: string; existingWatchId?: string }
  | { kind: "saved_question"; question: string; savedReportId: string };

export function WatchButton(props: WatchButtonProps) {
  // The drug page only mounts this once its data (incl. the user's existing watches) has loaded, so
  // reading existingWatchId at init is safe — it won't arrive late and miss this initializer.
  const [state, setState] = useState<State>(
    props.kind === "topic" && props.existingWatchId
      ? { kind: "created", id: props.existingWatchId }
      : { kind: "idle" },
  );
  const label = props.kind === "topic" && props.label
    ? props.label
    : props.kind === "saved_question"
      ? "Watch this report"
      : "Watch this topic";

  async function start() {
    if (state.kind === "creating") return;
    setState({ kind: "creating" });
    const q = props.question.trim();
    const title = props.kind === "topic" && props.title ? props.title : watchTitleFromQuestion(q);
    const input: CreateWatchInput = props.kind === "saved_question"
      ? { kind: "saved_question", title, saved_report_id: props.savedReportId, query_terms: q }
      : { kind: "topic", title, topic: q, query_terms: q, mentions: props.mentions };
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
