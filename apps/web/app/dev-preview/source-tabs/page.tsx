"use client";

// DEV-ONLY PREVIEW — the Canvas reading pane, without the auth gate.
//
// Three pills, because the pane has three genuinely different behaviours and only one of them is
// the obvious case:
//   * a FILED document  -> the real `LibrarySourceReader`, the whole document
//   * an EPHEMERAL one  -> the cited passage, and a line saying why there is no full copy
//   * a WEB page        -> does NOT enter the pane at all; it opens in the browser
//
// Same components the canvas mounts. Nothing here is a mock except the pills themselves.

import { CanvasSourcePills } from "@/components/workspace/learn/canvas-source-pills";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { SourceTabPane, SourceTabsProvider } from "@/components/workspace/learn/source-tab-viewer";
import type { SourcePill } from "@/lib/learn/source-pill";

const PILLS: SourcePill[] = [
  {
    kind: "document",
    label: "Con Law lecture 4",
    title: "Con Law lecture 4 · Standing",
    section: "Standing",
    excerpt:
      "A plaintiff must show injury in fact, causation, and redressability. The injury must be concrete and particularised, not a generalised grievance shared with the public at large.",
    librarySourceId: "preview-src-conlaw-slides",
  },
  {
    kind: "document",
    label: "Seminar handout",
    title: "Seminar handout · Ripeness",
    section: "Ripeness",
    excerpt:
      "Ripeness asks whether the harm has happened yet. A claim brought too early is dismissed not because it is wrong but because there is nothing yet to decide.",
    librarySourceId: null,
  },
  {
    kind: "web",
    label: "Law.cornell",
    host: "law.cornell.edu",
    title: "Standing · Legal Information Institute",
    url: "https://www.law.cornell.edu/wex/standing",
  },
];

export default function SourceTabsPreviewPage() {
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
    <SourceTabsProvider>
      {/* 🔴 `data-workspace` OR THE CHROME LAYER DOES NOT APPLY. The desktop token and chrome
          rules are scoped to this attribute, which `WorkspaceShell` normally stamps. Without it a
          preview renders with fallback colours and every pill comes out looking like a button from
          a different app. */}
      <div className="relative h-dvh overflow-hidden bg-(--ui-bg-editor)" data-workspace="">
        <SourceTabPane />
        <div className="relative h-full overflow-y-auto px-8 pt-16 xl:w-[calc(100%-360px)]">
          <div className="mx-auto max-w-[640px]">
            <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
              Why was the case dismissed if the statute is unconstitutional?
            </p>
            <p className="mt-6 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)">
              Because the court never reached that question. Before a court will look at whether a
              statute is constitutional, the person bringing the case has to show the statute has
              actually hurt them. That is standing, and it is a gate: fail it and the merits are
              never argued at all.
            </p>
            <p className="mt-4 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)">
              Here the plaintiff objected to the statute as a taxpayer. That is a grievance shared
              with everyone, which is exactly what the injury requirement excludes.
            </p>
            <CanvasSourcePills pills={PILLS} />
            <p className="mt-10 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
              Press a citation. The first is a filed document and opens the full reader; the second
              was never filed and shows its passage. The third is a page, so it opens in the
              browser rather than in the pane.
            </p>
          </div>
        </div>
      </div>
    </SourceTabsProvider>
    </WorkspacePreviewProvider>
  );
}
