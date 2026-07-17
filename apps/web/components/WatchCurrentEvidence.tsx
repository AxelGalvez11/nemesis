"use client";

import { useState } from "react";
import Link from "next/link";
import type { AskResponse } from "@nemesis/shared";
import { askQuestion } from "@/lib/api";
import { renderInline } from "@/lib/inline-md";
import { askHrefForWatch } from "@/lib/watch-format";
import { safeHref } from "@/lib/url";

// "The current evidence" for a watch, shown INLINE in the detail view instead of bouncing the user
// to the chat page. It loads on demand (a button press, not on open) so browsing watches never
// silently burns the user's daily Ask quota — one press runs one cited lookup and renders a compact
// digest right here: the evidence grade, the plain-English bottom line, and the top cited sources.
// A secondary "Open in Ask" link still leads to the full conversational answer for anyone who wants it.

// Compact provider label (mirrors the answer panel's abbreviations) — text only, no color square.
const SRC_LABEL: [string, string][] = [
  ["openfda", "FDA label"], ["dailymed", "FDA label"], ["label", "FDA label"],
  ["clinicaltrials", "ClinicalTrials.gov"], ["trial", "ClinicalTrials.gov"], ["nct", "ClinicalTrials.gov"],
  ["pubmed", "PubMed"], ["europepmc", "PubMed"], ["openalex", "OpenAlex"],
  ["medlineplus", "MedlinePlus"], ["faers", "FAERS"],
];
function srcLabel(t: string): string {
  const p = (t ?? "").toLowerCase();
  for (const [k, v] of SRC_LABEL) if (p.includes(k)) return v;
  return t || "source";
}

// Some source titles carry inline HTML (e.g. PubMed's "Mounjaro<sup>™</sup>"); strip tags so the raw
// markup never reaches the screen, then collapse the whitespace the removed tags may leave behind.
function cleanTitle(s: string): string {
  return s.replace(/<\/?[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

type LoadState = "idle" | "loading" | "done" | "error";

export function WatchCurrentEvidence({ query }: { query: string }) {
  const [state, setState] = useState<LoadState>("idle");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [err, setErr] = useState<string>("");

  async function load() {
    if (state === "loading") return;
    setState("loading");
    setErr("");
    try {
      const res = await askQuestion(query, "fast");
      setAnswer(res);
      setState("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load the current evidence — try again.");
      setState("error");
    }
  }

  return (
    <div className="watch-current">
      <p className="watch-current-text">
        Monitoring flags only what changes from here on. The cited evidence on this topic right now:
      </p>
      {state === "idle" ? (
        <button type="button" className="chip-action watch-current-link" onClick={() => void load()}>
          Show the current evidence
        </button>
      ) : null}
      {state === "loading" ? <p className="watch-current-loading">Pulling the current evidence…</p> : null}
      {state === "error" ? (
        <p className="watch-current-err">
          {err}{" "}
          <button type="button" className="linklike" onClick={() => void load()}>Try again</button>
        </p>
      ) : null}
      {state === "done" && answer ? <EvidenceResult answer={answer} query={query} /> : null}
    </div>
  );
}

function EvidenceResult({ answer, query }: { answer: AskResponse; query: string }) {
  const sources = answer.citations.slice(0, 6);
  const showGrade = !answer.template && !answer.refused_unsupported && Boolean(answer.evidence_grade);
  const askHref = askHrefForWatch(query);
  return (
    <div className="watch-evidence">
      {showGrade ? (
        <div className="grade-row"><span className="grade">{answer.evidence_grade.replace(/_/g, " ")}</span></div>
      ) : null}
      {answer.plain_english_summary ? <p className="ai-para">{renderInline(answer.plain_english_summary)}</p> : null}
      {sources.length ? (
        <ul className="watch-evidence-src">
          {sources.map((c, i) => {
            const href = safeHref(c.oa_url ?? c.url ?? undefined);
            const label = srcLabel(c.source_type);
            const title = cleanTitle(c.title ?? "") || label;
            return (
              <li key={i}>
                <span className="watch-evidence-srclabel">{label}</span>
                {href ? <a href={href} target="_blank" rel="noopener noreferrer">{title}</a> : <span>{title}</span>}
              </li>
            );
          })}
        </ul>
      ) : null}
      {askHref ? (
        <Link className="watch-evidence-more" href={askHref}>Open the full answer in Ask →</Link>
      ) : null}
    </div>
  );
}
