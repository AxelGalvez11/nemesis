"use client";

// DEV-ONLY DESIGN EXPLORATION — five Library directions, so Nemesis can look like itself.
//
// 🔴 `sections` SHIPPED on 2026-09-04 as the real Library (`library-outputs.tsx`) and as the frame
// all three shelf pages share (`shell/page-frame.tsx`), minus the Projects shelf (owner: "remove
// projects from library"). The other four stay here as the record of what was compared.
//
// Owner 2026-09-04: the workspace pages "looked too much like ChatGPT"; after Projects moved to
// cards he asked for "some design variations so nemesis can look unique" for the Library.
//
// 🔴 EVERY DIRECTION IS DRAWN INSIDE THE REAL SHELL. Codex's earlier exploration drew a mocked
// sidebar and a fake browser frame; this page mounts `WorkspaceShell` under the preview provider,
// the same way `/dev-preview/library/outputs` does, so what the owner compares is what would ship
// — the real rail, the real ground, the real tokens, the real dark mode.
//
// 🔴 THE FIXTURE IS THE SHIPPED ONE. The five decks, three notes, two slide decks and five
// folders below are copied from `/dev-preview/library/outputs`, so all four directions show the
// same fourteen things and any difference between them is design, not data. Nothing here reaches
// Supabase; rows are pure state, and the filters, search and rail are live so the owner can press
// them.
//
// 🔴 ONE ACCENT, NO BRAND HUE. `desktop-ui.css` (owner 2026-08-13, 2026-08-23) rules that
// Nemesis's identity comes from typography, spacing and motion, not colour. So the four
// directions differ in STRUCTURE — a journal by day, shelves by project, a typographic index, a
// two-pane desk — and none of them reaches for a coloured panel. The three kind colours the
// shipped Library already uses (deck green, note blue, slides orange) appear only in Ledger, and
// only as an 8px dot.
//
// Pick a direction with `?d=sections|ledger|shelves|index|desk`; `&chrome=0` hides the switcher for
// screenshots.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Folder as FolderIcon,
  Layers,
  MonitorPlay,
  NotebookText,
  Plus,
  Search,
} from "lucide-react";

import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { cn } from "@/lib/utils";

/* ── Fixture ────────────────────────────────────────────────────────────────────────────────── */

type Kind = "deck" | "note" | "slides";

interface Item {
  id: string;
  kind: Kind;
  title: string;
  /** The row's own date: created for decks and slides, last edited for notes. */
  at: string;
  folderId: string | null;
  /** Decks only: how many cards. The one count the product really holds. */
  cards?: number;
  /** Notes only: who wrote it. */
  madeBy?: "learner" | "nemesis";
}

interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  /** Made with the Library's own button, so it draws even while empty. */
  madeIn?: "library";
}

/** Frozen so the "This week / August" groups in Ledger do not drift as real days pass. */
const NOW = new Date("2026-09-04T12:00:00.000Z");

const FOLDERS: readonly FolderRow[] = [
  { createdAt: "2026-08-30T18:45:00.000Z", id: "f-new", madeIn: "library", name: "Week 5 reading", parentId: null },
  { createdAt: "2026-07-28T09:00:00.000Z", id: "f-fall", name: "Fall 2026", parentId: null },
  { createdAt: "2026-08-02T09:00:00.000Z", id: "f-torts", name: "Torts", parentId: "f-fall" },
  { createdAt: "2026-06-11T09:00:00.000Z", id: "f-thermo", name: "Thermodynamics", parentId: null },
  { createdAt: "2026-03-19T09:00:00.000Z", id: "f-phcy", name: "PHCY 2105", parentId: null },
];

const ITEMS: readonly Item[] = [
  { at: "2026-08-25T11:00:00.000Z", cards: 42, folderId: "f-torts", id: "d1", kind: "deck", title: "Negligence: duty of care" },
  { at: "2026-08-21T09:30:00.000Z", cards: 7, folderId: "f-torts", id: "d2", kind: "deck", title: "Contract formation, offer and acceptance" },
  { at: "2026-08-18T16:00:00.000Z", cards: 128, folderId: "f-thermo", id: "d3", kind: "deck", title: "The second law and entropy" },
  { at: "2026-07-30T13:00:00.000Z", cards: 1, folderId: null, id: "d4", kind: "deck", title: "The Gracchi and the land question" },
  {
    at: "2026-06-02T10:00:00.000Z",
    cards: 63,
    folderId: "f-phcy",
    id: "d5",
    kind: "deck",
    title: "Renal physiology, the nephron, and how the loop of Henle concentrates urine",
  },
  { at: "2026-08-24T08:00:00.000Z", folderId: "f-thermo", id: "n1", kind: "note", madeBy: "nemesis", title: "How a four-stroke diesel engine works" },
  { at: "2026-08-12T15:00:00.000Z", folderId: null, id: "n2", kind: "note", madeBy: "nemesis", title: "Statistical power and sample size" },
  { at: "2025-12-03T09:00:00.000Z", folderId: "f-torts", id: "n3", kind: "note", madeBy: "learner", title: "Supply, demand and price ceilings" },
  { at: "2026-08-23T12:00:00.000Z", folderId: "f-thermo", id: "s1", kind: "slides", title: "Beam deflection under a distributed load" },
  { at: "2026-08-09T12:00:00.000Z", folderId: null, id: "s2", kind: "slides", title: "Fourier transforms, first pass" },
];

/* ── Shared vocabulary ──────────────────────────────────────────────────────────────────────── */

type Shelf = "all" | Kind;

const SHELVES: readonly { id: Shelf; label: string }[] = [
  { id: "all", label: "All" },
  { id: "deck", label: "Flashcards" },
  { id: "slides", label: "Slides" },
  { id: "note", label: "Documents" },
];

const KIND_LABEL: Record<Kind, string> = { deck: "Flashcards", note: "Document", slides: "Slides" };
/** The shipped Library's own three. Ledger is the only direction that uses them. */
const KIND_COLOR: Record<Kind, string> = { deck: "#34C759", note: "#0285FF", slides: "#FF9500" };

function KindGlyph({ kind, size = 18, className }: { kind: Kind; size?: number; className?: string }) {
  const Icon = kind === "deck" ? Layers : kind === "note" ? NotebookText : MonitorPlay;
  return <Icon aria-hidden className={className} size={size} strokeWidth={1.7} />;
}

/** What a row can honestly say about itself beyond its title. */
function detail(item: Item): string {
  if (item.kind === "deck") return `${item.cards} card${item.cards === 1 ? "" : "s"}`;
  if (item.kind === "note") return item.madeBy === "learner" ? "Your notes" : "Written by Nemesis";
  return "Slide deck";
}

function when(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === NOW.getFullYear();
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

const byId = new Map(FOLDERS.map((folder) => [folder.id, folder]));

/** "Fall 2026 / Torts" for a nested folder, the plain name otherwise. */
function pathOf(folderId: string | null): string {
  if (!folderId) return "Unfiled";
  const parts: string[] = [];
  let current = byId.get(folderId);
  let guard = 0;
  while (current && guard++ < 8) {
    parts.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return parts.join(" / ");
}

function folderNameOf(folderId: string | null): string {
  return folderId ? (byId.get(folderId)?.name ?? "Unfiled") : "Unfiled";
}

/** Every folder id at or under `folderId`, so a parent rolls its children up. */
function underFolder(folderId: string): Set<string> {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of FOLDERS) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

function useLibraryState() {
  const [shelf, setShelf] = useState<Shelf>("all");
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...ITEMS]
      .filter((item) => shelf === "all" || item.kind === shelf)
      .filter((item) => needle === "" || item.title.toLowerCase().includes(needle))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [query, shelf]);
  return { items, query, setQuery, shelf, setShelf };
}

/* ── A. Ledger — a journal of what Nemesis made, newest first, grouped by day ───────────────── */

function ledgerGroup(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((NOW.getTime() - date.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return "This week";
  if (date.getFullYear() !== NOW.getFullYear()) return String(date.getFullYear());
  return date.toLocaleDateString("en-US", { month: "long" });
}

function LedgerLibrary() {
  const { items, query, setQuery, shelf, setShelf } = useLibraryState();
  const groups = useMemo(() => {
    const out: { label: string; rows: Item[] }[] = [];
    for (const item of items) {
      const label = ledgerGroup(item.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(item);
      else out.push({ label, rows: [item] });
    }
    return out;
  }, [items]);

  return (
    <main className="scrollbar-dt h-full overflow-y-auto bg-(--ui-bg-sidebar)">
      <div className="mx-auto w-full max-w-[768px] px-[24px] pt-[96px] pb-[96px]">
        {/* The title row carries the type tabs beside it: one line says what this is and what
            you are looking at. Text tabs with a hairline under the live one, not pills. */}
        <header className="flex items-end justify-between gap-[24px]">
          <div className="flex items-end gap-[28px]">
            <h1 className="text-[22px] leading-[28px] font-semibold tracking-[-0.01em] text-(--ui-text-primary)">Library</h1>
            <nav className="flex items-end gap-[20px]">
              {SHELVES.map((option) => (
                <button
                  aria-pressed={shelf === option.id}
                  className={cn(
                    "relative pb-[4px] text-[14px] leading-[20px] transition-colors",
                    shelf === option.id
                      ? "font-medium text-(--ui-text-primary) after:absolute after:inset-x-0 after:bottom-[-1px] after:h-[2px] after:rounded-full after:bg-(--ui-text-primary)"
                      : "text-(--ui-text-tertiary) hover:text-(--ui-text-primary)",
                  )}
                  key={option.id}
                  onClick={() => setShelf(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-[16px]">
            <label className="relative flex items-center">
              <Search aria-hidden className="pointer-events-none absolute left-0 text-(--ui-text-tertiary)" size={15} strokeWidth={1.8} />
              <input
                className="h-[28px] w-[180px] border-b border-b-(--ui-stroke-secondary) bg-transparent pl-[22px] text-[14px] text-(--ui-text-primary) placeholder:text-(--ui-text-tertiary) focus:border-b-(--ui-text-primary) focus:outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                type="text"
                value={query}
              />
            </label>
            <button
              className="flex h-[28px] items-center gap-[4px] text-[14px] text-(--ui-text-secondary) transition-colors hover:text-(--ui-text-primary)"
              type="button"
            >
              <Plus size={15} strokeWidth={2} />
              New folder
            </button>
          </div>
        </header>

        {/* Projects as a quiet row of chips, so a folder made with the button above has somewhere
            to appear the moment it exists — the exact defect the owner reported on 2026-09-04. */}
        <div className="mt-[20px] flex flex-wrap items-center gap-[4px]">
          {FOLDERS.filter((folder) => folder.parentId === null).map((folder) => (
            <button
              className="flex h-[26px] items-center gap-[6px] rounded-[6px] px-[8px] text-[13px] leading-[18px] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-primary)"
              key={folder.id}
              type="button"
            >
              <FolderIcon aria-hidden size={13} strokeWidth={1.8} />
              {folder.name}
            </button>
          ))}
        </div>

        <div className="mt-[28px] flex flex-col gap-[32px]">
          {groups.length === 0 && <p className="text-[14px] text-(--ui-text-secondary)">Nothing matches that.</p>}
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-[6px] text-[12px] leading-[16px] font-medium tracking-[0.06em] text-(--ui-text-tertiary) uppercase">
                {group.label}
              </h2>
              <ul className="flex flex-col">
                {group.rows.map((item) => (
                  <li key={item.id}>
                    <button
                      className="group/row flex h-[44px] w-full items-center gap-[14px] rounded-[8px] px-[10px] text-left transition-colors hover:bg-(--ui-control-hover-background)"
                      type="button"
                    >
                      <span aria-hidden className="size-[8px] shrink-0 rounded-full" style={{ background: KIND_COLOR[item.kind] }} />
                      <span className="min-w-0 flex-1 truncate text-[14px] leading-[20px] font-medium text-(--ui-text-primary)">{item.title}</span>
                      <span className="shrink-0 text-[13px] leading-[18px] text-(--ui-text-tertiary)">
                        {detail(item)}
                        <span className="mx-[8px] opacity-60">·</span>
                        {folderNameOf(item.folderId)}
                      </span>
                      <span className="w-[84px] shrink-0 text-right text-[13px] leading-[18px] whitespace-nowrap text-(--ui-text-quaternary) tabular-nums">
                        {when(item.at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

/* ── B. Shelves — one shelf per project, tiles along it ─────────────────────────────────────── */

function Segmented({ value, onChange }: { value: Shelf; onChange: (next: Shelf) => void }) {
  return (
    <div className="flex h-[32px] items-center rounded-[8px] bg-(--ui-bg-tertiary) p-[3px]" role="tablist">
      {SHELVES.map((option) => (
        <button
          aria-selected={value === option.id}
          className={cn(
            "h-full rounded-[6px] px-[12px] text-[13px] leading-[18px] font-medium transition-colors",
            value === option.id
              ? "bg-(--ui-bg-elevated) text-(--ui-text-primary) shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              : "text-(--ui-text-secondary) hover:text-(--ui-text-primary)",
          )}
          key={option.id}
          onClick={() => onChange(option.id)}
          role="tab"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Tile({ item, height = 120 }: { item: Item; height?: number }) {
  return (
    <button
      className="flex flex-col rounded-[12px] bg-(--ui-bg-elevated) p-[14px] text-left shadow-[inset_0_0_0_1px_var(--ui-stroke-tertiary)] transition-[box-shadow,transform] hover:shadow-[inset_0_0_0_1px_var(--ui-stroke-secondary),0_4px_14px_-6px_rgba(0,0,0,0.18)] active:scale-[0.99]"
      style={{ height }}
      type="button"
    >
      <KindGlyph className="text-(--ui-text-secondary)" kind={item.kind} />
      <span className="mt-[10px] line-clamp-2 text-[14px] leading-[19px] font-medium text-(--ui-text-primary)">{item.title}</span>
      <span className="mt-auto truncate text-[12px] leading-[16px] text-(--ui-text-tertiary)">
        {detail(item)}
        <span className="mx-[6px] opacity-60">·</span>
        {when(item.at)}
      </span>
    </button>
  );
}

function ShelvesLibrary() {
  const { items, query, setQuery, shelf, setShelf } = useLibraryState();
  const shelves = useMemo(() => {
    const order: (string | null)[] = [];
    const seen = new Set<string | null>();
    // Projects in the order the learner last touched them, Unfiled last, and an empty folder made
    // on this page still gets a shelf so it does not vanish the moment it is created.
    for (const item of items) if (!seen.has(item.folderId) && item.folderId !== null) { seen.add(item.folderId); order.push(item.folderId); }
    for (const folder of FOLDERS) if (folder.madeIn === "library" && !seen.has(folder.id)) { seen.add(folder.id); order.push(folder.id); }
    if (items.some((item) => item.folderId === null)) order.push(null);
    return order.map((folderId) => ({ folderId, rows: items.filter((item) => item.folderId === folderId) }));
  }, [items]);

  return (
    <main className="scrollbar-dt h-full overflow-y-auto bg-(--ui-bg-sidebar)">
      <div className="mx-auto w-full max-w-[896px] px-[24px] pt-[72px] pb-[96px]">
        <header className="flex items-center justify-between gap-[16px]">
          <h1 className="text-[26px] leading-[32px] font-semibold tracking-[-0.01em] text-(--ui-text-primary)">Library</h1>
          <div className="flex items-center gap-[10px]">
            <Segmented onChange={setShelf} value={shelf} />
            <label className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-[10px] -translate-y-1/2 text-(--ui-text-tertiary)" size={15} strokeWidth={1.8} />
              <input
                className="h-[32px] w-[200px] rounded-[8px] bg-(--ui-bg-tertiary) pr-[10px] pl-[30px] text-[13px] text-(--ui-text-primary) placeholder:text-(--ui-text-tertiary) focus:outline-none focus:ring-1 focus:ring-(--ui-stroke-secondary)"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search library"
                type="text"
                value={query}
              />
            </label>
            <button
              className="flex h-[32px] items-center gap-[6px] rounded-[8px] px-[12px] text-[13px] font-medium text-(--ui-text-primary) shadow-[inset_0_0_0_1px_var(--ui-stroke-secondary)] transition-colors hover:bg-(--ui-control-hover-background)"
              type="button"
            >
              <Plus size={15} strokeWidth={2} />
              New folder
            </button>
          </div>
        </header>

        <div className="mt-[36px] flex flex-col gap-[36px]">
          {shelves.length === 0 && <p className="text-[14px] text-(--ui-text-secondary)">Nothing matches that.</p>}
          {shelves.map((group) => (
            <section key={group.folderId ?? "unfiled"}>
              <div className="mb-[12px] flex items-center gap-[8px]">
                <FolderIcon aria-hidden className="text-(--ui-text-secondary)" size={16} strokeWidth={1.8} />
                <h2 className="text-[15px] leading-[20px] font-medium text-(--ui-text-primary)">{pathOf(group.folderId)}</h2>
                <span className="text-[13px] leading-[18px] text-(--ui-text-tertiary)">
                  {group.rows.length === 0 ? "empty" : `${group.rows.length} item${group.rows.length === 1 ? "" : "s"}`}
                </span>
                {group.folderId && (
                  <button
                    className="ml-auto flex items-center gap-[2px] text-[13px] text-(--ui-text-tertiary) transition-colors hover:text-(--ui-text-primary)"
                    type="button"
                  >
                    Open
                    <ChevronRight size={14} strokeWidth={1.8} />
                  </button>
                )}
              </div>
              {group.rows.length === 0 ? (
                <div className="flex h-[120px] w-[200px] items-center justify-center rounded-[12px] border border-dashed border-(--ui-stroke-secondary) text-[13px] text-(--ui-text-tertiary)">
                  Nothing here yet
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-[16px]">
                  {group.rows.map((item) => (
                    <Tile item={item} key={item.id} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

/* ── C. Index — no icons, a typographic table of contents ───────────────────────────────────── */

function IndexLibrary() {
  const { items, query, setQuery, shelf, setShelf } = useLibraryState();
  const folders = FOLDERS.filter((folder) => folder.parentId === null);

  return (
    <main className="scrollbar-dt h-full overflow-y-auto bg-(--ui-bg-sidebar)">
      <div className="mx-auto w-full max-w-[680px] px-[24px] pt-[104px] pb-[120px]">
        <header>
          <div className="flex items-baseline justify-between">
            <h1 className="text-[40px] leading-[44px] font-medium tracking-[-0.025em] text-(--ui-text-primary)">Library</h1>
            <label className="relative flex items-center">
              <Search aria-hidden className="pointer-events-none absolute left-0 text-(--ui-text-tertiary)" size={15} strokeWidth={1.8} />
              <input
                className="h-[28px] w-[160px] border-b border-b-(--ui-stroke-secondary) bg-transparent pl-[22px] text-[14px] text-(--ui-text-primary) placeholder:text-(--ui-text-tertiary) focus:border-b-(--ui-text-primary) focus:outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                type="text"
                value={query}
              />
            </label>
          </div>
          <p className="mt-[8px] text-[14px] leading-[20px] text-(--ui-text-tertiary)">
            {ITEMS.length} things across {folders.length} projects
          </p>

          {/* Two quiet rows under the title: what kind of thing, then which project. */}
          <div className="mt-[28px] flex items-center gap-[6px]">
            {SHELVES.map((option) => (
              <button
                aria-pressed={shelf === option.id}
                className={cn(
                  "h-[28px] rounded-full px-[12px] text-[13px] leading-[18px] transition-colors",
                  shelf === option.id
                    ? "bg-(--ui-text-primary) font-medium text-(--ui-bg-sidebar)"
                    : "text-(--ui-text-secondary) shadow-[inset_0_0_0_1px_var(--ui-stroke-secondary)] hover:text-(--ui-text-primary)",
                )}
                key={option.id}
                onClick={() => setShelf(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-[10px] flex flex-wrap items-center gap-[2px]">
            {folders.map((folder) => (
              <button
                className="flex h-[28px] items-center gap-[6px] rounded-full px-[10px] text-[13px] leading-[18px] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-primary)"
                key={folder.id}
                type="button"
              >
                <FolderIcon aria-hidden size={13} strokeWidth={1.8} />
                {folder.name}
              </button>
            ))}
            <button
              className="flex h-[28px] items-center gap-[4px] rounded-full px-[10px] text-[13px] leading-[18px] text-(--ui-text-tertiary) transition-colors hover:text-(--ui-text-primary)"
              type="button"
            >
              <Plus size={13} strokeWidth={2} />
              New folder
            </button>
          </div>
        </header>

        <ol className="mt-[24px] flex flex-col">
          {items.length === 0 && <p className="py-[16px] text-[14px] text-(--ui-text-secondary)">Nothing matches that.</p>}
          {items.map((item) => (
            <li className="border-b border-b-(--ui-stroke-tertiary)" key={item.id}>
              <button className="group/entry flex w-full items-baseline gap-[24px] py-[18px] text-left" type="button">
                <span className="w-[88px] shrink-0 text-[11px] leading-[16px] font-medium tracking-[0.08em] text-(--ui-text-quaternary) uppercase">
                  {KIND_LABEL[item.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] leading-[24px] font-medium tracking-[-0.01em] text-(--ui-text-primary) transition-colors group-hover/entry:text-(--ui-text-secondary)">
                    {item.title}
                  </span>
                  <span className="mt-[3px] block text-[13px] leading-[18px] text-(--ui-text-tertiary)">
                    {detail(item)}
                    <span className="mx-[6px] opacity-60">·</span>
                    {pathOf(item.folderId)}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] leading-[18px] text-(--ui-text-quaternary) tabular-nums">{when(item.at)}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}

/* ── D. Desk — projects down the left, that project's things on the right ───────────────────── */

function DeskLibrary() {
  const { items, query, setQuery, shelf, setShelf } = useLibraryState();
  const [folderId, setFolderId] = useState<string | "all" | null>("all");
  const roots = FOLDERS.filter((folder) => folder.parentId === null);
  const childrenOf = (id: string) => FOLDERS.filter((folder) => folder.parentId === id);
  const countIn = (id: string) => { const ids = underFolder(id); return ITEMS.filter((item) => item.folderId && ids.has(item.folderId)).length; };
  const shown = useMemo(() => {
    if (folderId === "all") return items;
    if (folderId === null) return items.filter((item) => item.folderId === null);
    const ids = underFolder(folderId);
    return items.filter((item) => item.folderId && ids.has(item.folderId));
  }, [folderId, items]);
  const heading = folderId === "all" ? "Everything" : folderId === null ? "Unfiled" : (byId.get(folderId)?.name ?? "");

  const railRow = (label: string, id: string | "all" | null, count: number, depth = 0): ReactNode => (
    <button
      aria-current={folderId === id ? "page" : undefined}
      className={cn(
        "flex h-[32px] w-full items-center gap-[8px] rounded-[7px] pr-[8px] text-left text-[13.5px] leading-[18px] transition-colors",
        folderId === id ? "bg-(--ui-control-active-background) font-medium text-(--ui-text-primary)" : "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-primary)",
      )}
      key={String(id)}
      onClick={() => setFolderId(id)}
      style={{ paddingLeft: 8 + depth * 16 }}
      type="button"
    >
      {id !== "all" && <FolderIcon aria-hidden className="shrink-0 opacity-70" size={14} strokeWidth={1.8} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[12px] text-(--ui-text-quaternary) tabular-nums">{count || ""}</span>
    </button>
  );

  return (
    <main className="flex h-full bg-(--ui-bg-sidebar)">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-r-(--ui-stroke-tertiary) px-[12px] pt-[28px] pb-[16px]">
        <h1 className="px-[8px] text-[15px] leading-[20px] font-semibold text-(--ui-text-primary)">Library</h1>
        <label className="relative mt-[14px] block">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-[9px] -translate-y-1/2 text-(--ui-text-tertiary)" size={14} strokeWidth={1.8} />
          <input
            className="h-[30px] w-full rounded-[7px] bg-(--ui-bg-tertiary) pr-[8px] pl-[28px] text-[13px] text-(--ui-text-primary) placeholder:text-(--ui-text-tertiary) focus:outline-none focus:ring-1 focus:ring-(--ui-stroke-secondary)"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            type="text"
            value={query}
          />
        </label>
        <nav className="mt-[16px] flex flex-col gap-[1px]">
          {railRow("Everything", "all", ITEMS.length)}
          <p className="mt-[14px] mb-[4px] px-[8px] text-[11px] leading-[16px] font-medium tracking-[0.06em] text-(--ui-text-quaternary) uppercase">Projects</p>
          {roots.map((folder) => (
            <div className="contents" key={folder.id}>
              {railRow(folder.name, folder.id, countIn(folder.id))}
              {childrenOf(folder.id).map((child) => railRow(child.name, child.id, countIn(child.id), 1))}
            </div>
          ))}
          {railRow("Unfiled", null, ITEMS.filter((item) => item.folderId === null).length)}
        </nav>
        <button
          className="mt-[10px] flex h-[32px] items-center gap-[6px] rounded-[7px] px-[8px] text-[13.5px] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-primary)"
          type="button"
        >
          <Plus size={14} strokeWidth={2} />
          New folder
        </button>
      </aside>

      <section className="scrollbar-dt min-w-0 flex-1 overflow-y-auto px-[40px] pt-[28px] pb-[96px]">
        <div className="max-w-[1040px]">
        <header className="flex items-center justify-between gap-[16px]">
          <div>
            <h2 className="text-[22px] leading-[28px] font-semibold tracking-[-0.01em] text-(--ui-text-primary)">{heading}</h2>
            {folderId !== "all" && folderId !== null && (
              <p className="mt-[2px] text-[13px] leading-[18px] text-(--ui-text-tertiary)">{pathOf(folderId)}</p>
            )}
          </div>
          <Segmented onChange={setShelf} value={shelf} />
        </header>
        {shown.length === 0 ? (
          <p className="mt-[24px] text-[14px] text-(--ui-text-secondary)">Nothing here yet.</p>
        ) : (
          <div className="mt-[24px] grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-[14px]">
            {shown.map((item) => (
              <Tile height={132} item={item} key={item.id} />
            ))}
          </div>
        )}
        </div>
      </section>
    </main>
  );
}

/* ── E. Sections — Gemini's library, measured 2026-09-04 and redrawn in Nemesis's tokens ─────
 *
 * Owner 2026-09-04: "look at this. https://gemini.google.com/library Maybe something similar to
 * this." Read off the live signed-in page at a 1456px viewport with getComputedStyle:
 *
 *   column        760px, centred in what the sidebar leaves
 *   title         "Library" 24px / weight 380 / 28px line, top edge 19px into the page
 *   section head  17px / 540 / 24px line, with a 40x40 round "View all" button on the right
 *                 edge, filled rgb(242,240,240), radius 100px
 *   row           760x89, radius 28px, padding 20px, fill rgb(242,240,240) on a rgb(250,249,249)
 *                 ground; 8px between rows on the overview, 4px on a View-all page
 *   row icon      24x24 outlined, at the left padding; text starts 60px in
 *   row title     17px / 400 / 24px; date under it 13px / 400 / 17px, 8px lower, rgb(68,71,70)
 *   row hover     an rgba(0,0,0,0.08) overlay
 *   sections      title, then 24px to the first heading row; 16px heading-to-rows; 24px between
 *                 sections
 *   View all      the same rows under a 40px round back arrow and the section name at 24/380
 *
 * What is NOT copied: Gemini's media grid (151px square tiles, 1px gaps) needs thumbnails, and
 * a slide deck here has none, so slides take the same honest icon row as everything else; and
 * Gemini's page has no search at all — a 40px round magnifier on the title row opens one here,
 * inside the same round-button grammar, because a library of a hundred things needs one.
 *
 * 🔴 THE THREE TYPE PILLS BECOME THREE SECTIONS. On the shipped page "Flashcards / Slides /
 * Documents" is a filter that narrows one list; here each kind is its own shelf with its own
 * View all, which is how Gemini organises its stuff. Projects get a shelf too, first, with the
 * round "+" for New folder beside their chevron — Gemini keeps notebooks in the sidebar, and
 * Nemesis keeps its projects here, so the shelf is the honest translation, not an invention.
 */

const PEEK = 3;

function RoundButton({ children, label, onClick }: { children: ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      aria-label={label}
      className="flex size-[40px] shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-(--ui-text-primary) transition-colors hover:bg-black/[0.08] dark:bg-white/[0.07] dark:hover:bg-white/[0.12]"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function SoftRow({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) {
  return (
    <button
      className="relative flex w-full items-start gap-[16px] overflow-hidden rounded-[28px] bg-black/[0.03] p-[20px] text-left transition-colors hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.12]"
      style={{ minHeight: 89 }}
      type="button"
    >
      <span className="flex size-[24px] shrink-0 items-center justify-center text-(--ui-text-primary)">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] leading-[24px] font-normal text-(--ui-text-primary)">{title}</span>
        <span className="mt-[8px] block truncate text-[13px] leading-[17px] text-(--ui-text-secondary)">{meta}</span>
      </span>
    </button>
  );
}

type Section = "folder" | Kind;

const SECTION_LABEL: Record<Section, string> = { deck: "Flashcards", folder: "Projects", note: "Documents", slides: "Slides" };
const SECTION_ORDER: readonly Section[] = ["folder", "deck", "slides", "note"];

function SectionsLibrary() {
  const [open, setOpen] = useState<Section | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const outputs = (kind: Kind) =>
    [...ITEMS].filter((item) => item.kind === kind && (needle === "" || item.title.toLowerCase().includes(needle))).sort((a, b) => b.at.localeCompare(a.at));
  const folders = [...FOLDERS]
    .filter((folder) => needle === "" || folder.name.toLowerCase().includes(needle))
    .map((folder) => {
      const ids = underFolder(folder.id);
      const inside = ITEMS.filter((item) => item.folderId && ids.has(item.folderId));
      const latest = inside.reduce((best, item) => (item.at > best ? item.at : best), folder.createdAt);
      return { ...folder, count: inside.length, latest };
    })
    .sort((a, b) => b.latest.localeCompare(a.latest));

  const folderRow = (folder: (typeof folders)[number]) => (
    <SoftRow
      icon={<FolderIcon size={22} strokeWidth={1.6} />}
      key={folder.id}
      meta={folder.count === 0 ? `Empty · made ${when(folder.createdAt)}` : `${folder.count} item${folder.count === 1 ? "" : "s"} · ${when(folder.latest)}`}
      title={pathOf(folder.id)}
    />
  );
  const itemRow = (item: Item) => (
    <SoftRow icon={<KindGlyph kind={item.kind} size={22} />} key={item.id} meta={`${detail(item)} · ${folderNameOf(item.folderId)} · ${when(item.at)}`} title={item.title} />
  );

  // The overview peeks at top-level projects only: a nested project rolls up into its parent's
  // count, so listing both is the same three items twice. View all shows every project by path.
  const rowsFor = (section: Section, peek = false): ReactNode[] =>
    section === "folder"
      ? folders.filter((folder) => !peek || folder.parentId === null).map(folderRow)
      : outputs(section).map(itemRow);

  const searchControl = searching ? (
    <label className="relative flex h-[40px] w-[240px] items-center">
      <Search aria-hidden className="pointer-events-none absolute left-[14px] text-(--ui-text-secondary)" size={16} strokeWidth={1.8} />
      <input
        autoFocus
        className="h-full w-full rounded-full bg-black/[0.04] pr-[14px] pl-[40px] text-[14px] text-(--ui-text-primary) placeholder:text-(--ui-text-tertiary) focus:outline-none dark:bg-white/[0.07]"
        onBlur={() => { if (query === "") setSearching(false); }}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search library"
        type="text"
        value={query}
      />
    </label>
  ) : (
    <RoundButton label="Search library" onClick={() => setSearching(true)}>
      <Search size={18} strokeWidth={1.8} />
    </RoundButton>
  );

  if (open) {
    const rows = rowsFor(open);
    return (
      <main className="scrollbar-dt h-full overflow-y-auto bg-(--ui-bg-sidebar)">
        <div className="mx-auto w-full max-w-[760px] px-[16px] pt-[16px] pb-[96px]">
          <header className="flex items-center gap-[8px]">
            <RoundButton label="Back to the Library" onClick={() => setOpen(null)}>
              <ArrowLeft size={20} strokeWidth={1.8} />
            </RoundButton>
            <h1 className="min-w-0 flex-1 truncate text-[24px] leading-[28px] font-normal text-(--ui-text-primary)">{SECTION_LABEL[open]}</h1>
            {open === "folder" && (
              <RoundButton label="New folder">
                <Plus size={20} strokeWidth={1.8} />
              </RoundButton>
            )}
            {searchControl}
          </header>
          <div className="mt-[20px] flex flex-col gap-[4px]">
            {rows.length === 0 ? <p className="px-[20px] py-[12px] text-[14px] text-(--ui-text-secondary)">Nothing here yet.</p> : rows}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="scrollbar-dt h-full overflow-y-auto bg-(--ui-bg-sidebar)">
      <div className="mx-auto w-full max-w-[760px] px-[16px] pt-[16px] pb-[96px]">
        <header className="flex h-[40px] items-center justify-between">
          <h1 className="text-[24px] leading-[28px] font-normal text-(--ui-text-primary)">Library</h1>
          {searchControl}
        </header>

        {SECTION_ORDER.map((section) => {
          const rows = rowsFor(section, true);
          if (rows.length === 0 && needle !== "") return null;
          return (
            <section className="mt-[24px]" key={section}>
              <div className="flex h-[40px] items-center justify-between">
                <h2 className="text-[17px] leading-[24px] font-medium text-(--ui-text-primary)">{SECTION_LABEL[section]}</h2>
                <div className="flex items-center gap-[8px]">
                  {section === "folder" && (
                    <RoundButton label="New folder">
                      <Plus size={20} strokeWidth={1.8} />
                    </RoundButton>
                  )}
                  <RoundButton label={`View all ${SECTION_LABEL[section].toLowerCase()}`} onClick={() => setOpen(section)}>
                    <ChevronRight size={20} strokeWidth={1.8} />
                  </RoundButton>
                </div>
              </div>
              <div className="mt-[16px] flex flex-col gap-[8px]">
                {rows.length === 0 ? (
                  <p className="px-[20px] py-[12px] text-[14px] text-(--ui-text-secondary)">
                    {section === "folder" ? "No projects yet." : `No ${SECTION_LABEL[section].toLowerCase()} yet. Ask Nemesis for some in any conversation.`}
                  </p>
                ) : (
                  rows.slice(0, PEEK)
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

/* ── The page ───────────────────────────────────────────────────────────────────────────────── */

const DIRECTIONS = {
  sections: { Component: SectionsLibrary, label: "Sections", note: "Gemini's library, redrawn in Nemesis's tokens: soft rows in sections, each with a View all." },
  ledger: { Component: LedgerLibrary, label: "Ledger", note: "A journal of what Nemesis made, newest first, grouped by day." },
  shelves: { Component: ShelvesLibrary, label: "Shelves", note: "One shelf per project, its things lined up along it." },
  index: { Component: IndexLibrary, label: "Index", note: "No icons. A typographic table of contents." },
  desk: { Component: DeskLibrary, label: "Desk", note: "Projects down the left, that project's things on the right." },
} as const;

type DirectionId = keyof typeof DIRECTIONS;

function isDirection(value: string | null): value is DirectionId {
  return value !== null && value in DIRECTIONS;
}

export default function LibraryVariationsPreview() {
  const [direction, setDirection] = useState<DirectionId>("sections");
  const [chrome, setChrome] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("d");
    if (isDirection(wanted)) setDirection(wanted);
    if (params.get("chrome") === "0") setChrome(false);
  }, []);

  const choose = (next: DirectionId) => {
    setDirection(next);
    const url = new URL(window.location.href);
    url.searchParams.set("d", next);
    window.history.replaceState(null, "", url);
  };

  const { Component } = DIRECTIONS[direction];

  return (
    <WorkspacePreviewProvider value={{ email: "preview@nemesis.dev" }}>
      <WorkspaceShell>
        <Component key={direction} />
      </WorkspaceShell>
      {chrome && (
        <div className="fixed right-[20px] bottom-[20px] z-50 flex items-center gap-[2px] rounded-full bg-(--ui-text-primary) p-[4px] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)]">
          {(Object.keys(DIRECTIONS) as DirectionId[]).map((id) => (
            <button
              className={cn(
                "h-[30px] rounded-full px-[14px] text-[13px] font-medium transition-colors",
                id === direction ? "bg-(--ui-bg-sidebar) text-(--ui-text-primary)" : "text-(--ui-bg-sidebar) opacity-70 hover:opacity-100",
              )}
              key={id}
              onClick={() => choose(id)}
              title={DIRECTIONS[id].note}
              type="button"
            >
              {DIRECTIONS[id].label}
            </button>
          ))}
        </div>
      )}
    </WorkspacePreviewProvider>
  );
}
