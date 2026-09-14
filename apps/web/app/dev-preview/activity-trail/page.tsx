"use client";

// DEV-ONLY PREVIEW — the activity trail in its three states, side by side, without a model call.
//
// The learn harness makes no model calls, so a LIVE trail cannot be driven there; this page hands
// `ActivityTrailView` the shapes a real turn produces (activity-trail.ts) so the row, the plan, the
// marks and the lit running step can be reviewed against the owner's ChatGPT screenshots
// (2026-09-04). Every trail here is the shape the product stores; none is a mock of the component.

import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { ActivityTrailView } from "@/components/workspace/learn/activity-trail";
import type { ActivityTrail } from "@/lib/learn/activity-trail";

const PLAN = "You want the three questions on this worksheet explained. I'll read it, check the FDA's own pages on orphan and fast track designations, and lay out what each one asks.";

const LIVE: ActivityTrail = {
  plan: PLAN,
  seconds: 0,
  steps: [
    { count: 1, id: "read", kind: "read", titles: ["3. Regulatory Affairs Worksheet.docx"] },
    { count: 4, done: true, id: "search-1", kind: "search", query: "FDA orphan drug designation criteria", sites: ["fda.gov", "nih.gov", "raps.org"] },
    { count: null, done: false, id: "search-2", kind: "search", query: "fast track vs breakthrough therapy vs accelerated approval", sites: [] },
  ],
};

const DONE: ActivityTrail = {
  plan: PLAN,
  seconds: 11.3,
  steps: [
    { count: 1, id: "read", kind: "read", titles: ["3. Regulatory Affairs Worksheet.docx"] },
    { count: 4, done: true, id: "search-1", kind: "search", query: "FDA orphan drug designation criteria", sites: ["fda.gov", "nih.gov", "raps.org"] },
    { count: 5, done: true, id: "search-2", kind: "search", query: "fast track vs breakthrough therapy vs accelerated approval", sites: ["fda.gov", "wikipedia.org"] },
    { app: "Google Calendar", appKey: "googlecalendar", done: true, id: "app-1-1", kind: "app", label: "Reading your Google Calendar" },
    { done: true, id: "work-1", kind: "work", label: "Looking up the structure" },
  ],
};

export default function ActivityTrailPreview() {
  return (
    <WorkspacePreviewProvider value={{ email: "preview@nemesis.local" }}>
      <div className="min-h-screen bg-(--ui-bg-editor) py-[48px]" data-workspace>
        <section className="mx-auto mb-[48px] w-full max-w-(--canvas-column) px-6 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
          Live: a search still running, the caption's line last
        </section>
        <ActivityTrailView domains={["fda.gov", "nih.gov"]} label="Comparing the two designations" live trail={LIVE} web />
        <section className="mx-auto my-[48px] w-full max-w-(--canvas-column) px-6 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
          Done: collapsed above the answer
        </section>
        <ActivityTrailView trail={DONE} />
        <div className="mx-auto w-full max-w-(--canvas-column) px-6 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)">
          Your worksheet has three questions plus a references requirement. Here is what each one is actually asking.
        </div>
      </div>
    </WorkspacePreviewProvider>
  );
}
