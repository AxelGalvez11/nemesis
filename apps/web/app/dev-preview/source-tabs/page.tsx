"use client";

// DEV-ONLY PREVIEW — pressing a citation, without the auth gate.
//
// 🔴 IT USED TO PREVIEW A SECOND READING PANE, AND THAT PANE IS GONE (owner, 2026-09-03: *"clicking
// on the inline source chip should open documents on the right sidebar, NOT this new sidebar"*).
// What it shows now is the same Sources panel the canvas mounts, driven by the same dock — which is
// the whole point of the change, so the harness would be lying if it kept its own viewer.
//
// Three pills, because pressing one has three genuinely different outcomes and only one is obvious:
//   * a FILED document  -> the real `LibrarySourceReader`, in the Sources panel
//   * an EPHEMERAL one  -> the passage dialog, because there is no full copy to open
//   * a WEB page        -> does NOT dock at all; it opens in the browser

import { CanvasSourcePills } from "@/components/workspace/learn/canvas-source-pills";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { DocumentDockProvider, documentKey, useDocumentDockState } from "@/components/workspace/learn/document-dock";
import { SourcePreview } from "@/components/workspace/learn/source-preview";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import type { SourcePill } from "@/lib/learn/source-pill";

/** The canvas's own sources, which is what a pill is resolved against. */
const SOURCES: CanvasSource[] = [
  {
    id: "src-conlaw",
    title: "Con Law lecture 4",
    kind: "pdf",
    excerpts: [],
    librarySourceId: "preview-src-conlaw-slides",
    durable: true,
  } as CanvasSource,
  // 🔴 NO `librarySourceId`, WHICH IS THE POINT OF THE SECOND ROW. Every ephemeral attachment looks
  // like this, and the panel has no document to fetch for it — so the pill falls back to its own
  // passage dialog rather than docking an empty reader.
  { id: "src-handout", title: "Seminar handout", kind: "pdf", excerpts: [], durable: false } as CanvasSource,
];

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
  // Owns the dock exactly as the canvas does. The provider only carries the value down.
  const dock = useDocumentDockState(SOURCES);
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <DocumentDockProvider value={dock}>
        {/* 🔴 `data-workspace` OR THE CHROME LAYER DOES NOT APPLY. The desktop token and chrome
            rules are scoped to this attribute, which `WorkspaceShell` normally stamps. Without it a
            preview renders with fallback colours and every pill comes out looking like a button
            from a different app. */}
        <div className="relative h-dvh overflow-hidden bg-(--ui-bg-editor)" data-workspace="">
          <SourcePreview
            activeId={dock.activeId}
            activeKey={dock.activeKey}
            items={dock.items}
            onClose={dock.closeAll}
            onCloseKey={dock.close}
            onCloseTab={(id) => dock.close(documentKey(id))}
            onSelect={(id) => dock.select(documentKey(id))}
            onSelectKey={dock.select}
            open={dock.open}
            uid={null}
          />
          <div className="relative h-full overflow-y-auto px-8 pt-16">
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
                Press a citation. The first is a filed document and opens in the Sources panel; the
                second was never filed, so it shows the quoted passage instead. The third is a page, so it
                opens in the browser.
              </p>
            </div>
          </div>
        </div>
      </DocumentDockProvider>
    </WorkspacePreviewProvider>
  );
}
