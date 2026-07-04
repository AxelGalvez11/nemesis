// DEV-ONLY PREVIEW — remove before merge.
// Renders AgentRunTracker with a fixed 6-step journal-club fixture so the component can be
// screenshotted in isolation. Route: /dev-preview/agentrun. Placed at the ROOT route level (outside
// /app) so it does NOT inherit AppShell's client-side sign-in redirect — it renders on a plain themed
// page without auth. NOT under an "_"-prefixed folder (those are Next private folders, excluded from
// routing).
"use client";

import { AgentRunTracker, type AgentRunStep } from "@/components/AgentRunTracker";

const FIXTURE: AgentRunStep[] = [
  { label: "Research and select a high-impact recent biochemistry paper", state: "done", elapsedMs: 35_000 },
  { label: "Extract and synthesize paper content into structured notes", state: "done", elapsedMs: 215_000 },
  { label: "Write the full journal club report", state: "done", elapsedMs: 100_000 },
  { label: "Prepare slide content outline", state: "done", elapsedMs: 65_000 },
  {
    label: "Generate the presentation slides",
    state: "active",
    elapsedMs: 48_000,
    detail:
      "Confirmed the AlphaFold 3 slide outline; batch-generating slides 9 and 10, focusing on the unified framework and drug-discovery impact.",
  },
  { label: "Deliver the report and slides to the user", state: "pending" },
];

export default function AgentRunPreviewPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "48px 24px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ font: "500 16px/1.3 var(--font)", color: "var(--text-3)", marginBottom: 20 }}>
          Task progress
        </h1>
        <AgentRunTracker steps={FIXTURE} />
      </div>
    </div>
  );
}
