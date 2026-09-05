"use client";

// DEV-ONLY PREVIEW — the Library page of OUTPUTS, without the auth gate.
//
// 🔴 IT IS A SECOND PATH, NOT A REPLACEMENT. `/dev-preview/library` belongs to the retired canvas
// manager and still renders it; this is `/dev-preview/library/outputs` and renders `LibraryOutputs`,
// the component the shipped `/library` route mounts. Two different objects have carried the name
// "Library" in this repo and both previews have to keep working.
//
// 🔴 IT EXISTS SO THE FRAME CAN BE MEASURED RATHER THAN ASSERTED. Since 2026-09-04 the page wears
// the shared frame (`shell/page-frame.tsx`, measured off Gemini's library): a 760 column, a 24px
// title on y=22, 89px soft rows. The real route is behind a Supabase session, so nothing headless
// reaches a single row of it, and a local dev server with no credentials renders empty sections.
// Without this route the geometry could only ever be asserted from the source; this URL is what
// the Playwright probes run against, beside /dev-preview/projects and /dev-preview/workspace/apps.
//
// 🔴 IT SUBSTITUTES THE ROWS, NOT THE COMPONENT — the rule `/dev-preview/library` set and
// `/dev-preview/projects` follows, and the only thing that makes the measurement mean anything.
// Every class, column and control here is the shipped one; four arrays are handed in instead of
// fetched. A preview that re-assembled the surface would prove nothing about the real one.
//
// 🔴 THE SHELVES ARE DELIBERATELY SPREAD ACROSS FIELDS. A preview is what gets screenshotted,
// demoed and remembered, so a preview full of one discipline quietly teaches the wrong audience
// about who Nemesis is for. One pharmacy deck stays, because pharmacy students are welcome; what
// is gone is the impression that they are the only ones.

import { LibraryOutputs, type LibraryPreview } from "@/components/workspace/library/library-outputs";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";

const PREVIEW: LibraryPreview = {
  // 🔴 THE CARD COUNTS ARE SPREAD ACROSS ONE, TWO AND THREE DIGITS on purpose. The Cards column is
  // 88px wide and right of a 160px Modified; a preview where every count was two digits would not
  // show whether the column holds its width, which is half of what is being measured.
  decks: [
    { cards: 42, createdAt: "2026-08-25T11:00:00.000Z", folderId: "f-torts", id: "d1", name: "Negligence: duty of care" },
    { cards: 7, createdAt: "2026-08-21T09:30:00.000Z", folderId: "f-torts", id: "d2", name: "Contract formation, offer and acceptance" },
    { cards: 128, createdAt: "2026-08-18T16:00:00.000Z", folderId: "f-thermo", id: "d3", name: "The second law and entropy" },
    { cards: 1, createdAt: "2026-07-30T13:00:00.000Z", folderId: null, id: "d4", name: "The Gracchi and the land question" },
    // 🔴 ONE ROW LONG ENOUGH TO TRUNCATE. The Name column is measured at 368px and truncates with
    // an ellipsis; a preview whose every title fits would never show that it does.
    {
      cards: 63,
      createdAt: "2026-06-02T10:00:00.000Z",
      folderId: "f-phcy",
      id: "d5",
      name: "Renal physiology, the nephron, and how the loop of Henle concentrates urine",
    },
  ],
  folders: [
    // 🔴🔴 AN EMPTY FOLDER MADE ON THIS PAGE, WHICH IS THE ONE CASE THAT USED TO BE INVISIBLE. It
    // holds nothing, so `foldersWithContent` excludes it and every other empty folder here stays
    // excluded — `madeIn: "library"` is the whole reason this row draws. Without it in the fixture
    // the fix is unpreviewable and the defect the owner reported (2026-09-04, "making a folder in
    // library doesnt work like in chatgpt") has no seat on the harness. It is also the NEWEST row,
    // so it exercises the `createdAt` fallback: with no content to roll up it must still print a
    // date and sort to the top, the way an empty folder does on chatgpt.com/library.
    { createdAt: "2026-08-30T18:45:00.000Z", id: "f-new", madeIn: "library" as const, name: "Week 5 reading", parentId: null },
    { createdAt: "2026-07-28T09:00:00.000Z", id: "f-fall", name: "Fall 2026", parentId: null },
    { createdAt: "2026-08-02T09:00:00.000Z", id: "f-torts", name: "Torts", parentId: "f-fall" },
    { createdAt: "2026-06-11T09:00:00.000Z", id: "f-thermo", name: "Thermodynamics", parentId: null },
    { createdAt: "2026-03-19T09:00:00.000Z", id: "f-phcy", name: "PHCY 2105", parentId: null },
  ],
  // 🔴 BOTH ORIGINS ON THE BOARD ON PURPOSE. `madeBy` decides whether the reader is handed a
  // revise door at all, so a fixture carrying only one value would show half the behaviour and
  // look complete. n3 is the learner's own writing: it takes comments and is never offered a
  // rewrite.
  notes: [
    { folderId: "f-thermo", id: "n1", madeBy: "nemesis" as const, path: "notes/diesel.md", title: "How a four-stroke diesel engine works", updatedAt: "2026-08-24T08:00:00.000Z" },
    { folderId: null, id: "n2", madeBy: "nemesis" as const, path: "notes/power.md", title: "Statistical power and sample size", updatedAt: "2026-08-12T15:00:00.000Z" },
    { folderId: "f-torts", id: "n3", madeBy: "learner" as const, path: "notes/ceilings.md", title: "Supply, demand and price ceilings", updatedAt: "2025-12-03T09:00:00.000Z" },
  ],
  slides: [
    { assetId: "s1", canvasId: "c1", createdAt: "2026-08-23T12:00:00.000Z", folderId: "f-thermo", title: "Beam deflection under a distributed load" },
    { assetId: "s2", canvasId: "c2", createdAt: "2026-08-09T12:00:00.000Z", folderId: null, title: "Fourier transforms, first pass" },
  ],
};

export default function LibraryOutputsPreviewRoute() {
  return (
    <WorkspacePreviewProvider value={{ email: "preview@nemesis.dev" }}>
      <WorkspaceShell>
        <LibraryOutputs preview={PREVIEW} userId={null} />
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
