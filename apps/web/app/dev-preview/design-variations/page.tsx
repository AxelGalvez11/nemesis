"use client";

// DEV-ONLY DESIGN EXPLORATION — four coherent directions across Projects, Library and Apps.
//
// This route is intentionally fixture-backed. It makes no Supabase or Composio request and does
// not reuse a production page component, because the point is to compare new information
// architectures before one of them becomes production code. The existing production previews
// remain the source of truth for measuring shipped components.

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  AppWindow,
  ArrowRight,
  BookOpen,
  Boxes,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Folder,
  GraduationCap,
  Grid2X2,
  Layers3,
  ListFilter,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Share2,
  Sparkles,
  Table2,
  Upload,
  WandSparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { NemesisMark } from "@/components/nemesis-mark";
import { PluginIcon } from "@/components/workspace/plugins/plugin-icon";
import { cn } from "@/lib/utils";

type Surface = "projects" | "library" | "apps";
type DirectionId = "precision" | "atlas" | "workspace" | "signal";

interface Direction {
  id: DirectionId;
  number: string;
  name: string;
  promise: string;
  bestFor: string;
  tokens: CSSProperties;
}

const DIRECTIONS: readonly Direction[] = [
  {
    bestFor: "Fast scanning and the safest path from the current UI",
    id: "precision",
    name: "Precision",
    number: "01",
    promise: "A quieter, smarter evolution of the current list-first system.",
    tokens: {
      "--lab-accent": "#3ecf8e",
      "--lab-accent-ink": "#1a1a1a",
      "--lab-accent-soft": "var(--ui-control-active-background)",
      "--lab-bg": "var(--ui-bg-sidebar)",
      "--lab-ink": "var(--ui-text-primary)",
      "--lab-line": "var(--ui-stroke-tertiary)",
      "--lab-muted": "var(--ui-text-secondary)",
      "--lab-panel": "var(--ui-bg-elevated)",
      "--lab-sidebar": "var(--ui-sidebar-surface-background)",
      "--lab-sidebar-ink": "var(--ui-text-primary)",
    } as CSSProperties,
  },
  {
    bestFor: "Discovery, visual memory and a more ownable product identity",
    id: "atlas",
    name: "Atlas",
    number: "02",
    promise: "A visual library of learning objects, not a renamed file manager.",
    tokens: {
      "--lab-accent": "#3ecf8e",
      "--lab-accent-ink": "#1a1a1a",
      "--lab-accent-soft": "var(--ui-control-active-background)",
      "--lab-bg": "var(--ui-bg-sidebar)",
      "--lab-ink": "var(--ui-text-primary)",
      "--lab-line": "var(--ui-stroke-tertiary)",
      "--lab-muted": "var(--ui-text-secondary)",
      "--lab-panel": "var(--ui-bg-elevated)",
      "--lab-sidebar": "var(--ui-sidebar-surface-background)",
      "--lab-sidebar-ink": "var(--ui-text-primary)",
    } as CSSProperties,
  },
  {
    bestFor: "Power users managing deep project and content structures",
    id: "workspace",
    name: "Workspace",
    number: "03",
    promise: "A dense three-pane desktop where context never disappears.",
    tokens: {
      "--lab-accent": "var(--ui-action)",
      "--lab-accent-ink": "var(--ui-action-glyph)",
      "--lab-accent-soft": "color-mix(in srgb, var(--ui-action) 18%, transparent)",
      "--lab-bg": "color-mix(in srgb, var(--ui-action) 5%, #111216)",
      "--lab-ink": "#f4f3ef",
      "--lab-line": "color-mix(in srgb, var(--ui-action) 13%, #2b2d33)",
      "--lab-muted": "#9a9995",
      "--lab-panel": "color-mix(in srgb, var(--ui-action) 5%, #1a1b20)",
      "--lab-sidebar": "color-mix(in srgb, var(--ui-action) 4%, #0c0d10)",
      "--lab-sidebar-ink": "#f4f3ef",
    } as CSSProperties,
  },
  {
    bestFor: "Making Nemesis feel active, adaptive and meaningfully intelligent",
    id: "signal",
    name: "Signal",
    number: "04",
    promise: "A learning command center that surfaces what matters next.",
    tokens: {
      "--lab-accent": "var(--ui-action)",
      "--lab-accent-ink": "var(--ui-action-glyph)",
      "--lab-accent-soft": "color-mix(in srgb, var(--ui-action) 12%, transparent)",
      "--lab-bg": "color-mix(in srgb, var(--ui-action) 5%, #f1f0eb)",
      "--lab-ink": "#171717",
      "--lab-line": "color-mix(in srgb, var(--ui-action) 9%, #d8d5ce)",
      "--lab-muted": "#6f6d68",
      "--lab-panel": "color-mix(in srgb, var(--ui-action) 2%, #fffefa)",
      "--lab-sidebar": "color-mix(in srgb, var(--ui-action) 7%, #e9e6df)",
      "--lab-sidebar-ink": "#171717",
    } as CSSProperties,
  },
];

const DEFAULT_DIRECTION = DIRECTIONS[0]!;

const SURFACES: readonly { id: Surface; label: string }[] = [
  { id: "projects", label: "Projects" },
  { id: "library", label: "Library" },
  { id: "apps", label: "Apps" },
];

const PROJECTS = [
  { color: "var(--lab-accent)", count: 12, name: "Torts", progress: 72, time: "18 min ago", topic: "Negligence: duty of care" },
  { color: "var(--lab-accent)", count: 8, name: "Thermodynamics", progress: 46, time: "Yesterday", topic: "Entropy and the second law" },
  { color: "var(--lab-accent)", count: 17, name: "PHCY 2105", progress: 81, time: "Aug 30", topic: "Renal physiology" },
  { color: "var(--lab-accent)", count: 6, name: "The Roman Republic", progress: 34, time: "Aug 24", topic: "The Gracchi" },
  { color: "var(--lab-accent)", count: 4, name: "Statistics", progress: 58, time: "Aug 20", topic: "Power and sample size" },
  { color: "var(--lab-accent)", count: 0, name: "Second year, unfiled", progress: 0, time: "Jul 14", topic: "No canvases yet" },
] as const;

const LIBRARY_ITEMS = [
  { accent: "var(--ui-kind-amber)", kind: "Slides", meta: "24 slides", title: "Beam deflection under distributed load", when: "Today" },
  { accent: "var(--ui-kind-blue)", kind: "Document", meta: "8 min read", title: "Negligence: duty of care", when: "Today" },
  { accent: "var(--ui-kind-green)", kind: "Flashcards", meta: "42 cards", title: "Renal physiology and the nephron", when: "Yesterday" },
  { accent: "var(--ui-text-secondary)", kind: "Folder", meta: "9 items", title: "Week 5 reading", when: "Yesterday" },
  { accent: "var(--ui-kind-blue)", kind: "Document", meta: "12 min read", title: "Statistical power and sample size", when: "Aug 30" },
  { accent: "var(--ui-kind-green)", kind: "Flashcards", meta: "18 cards", title: "The Gracchi and the land question", when: "Aug 28" },
] as const;

const APPS = [
  { connected: true, detail: "Assignments, due dates and rubrics", group: "Coursework", key: "canvas", label: "Canvas LMS" },
  { connected: false, detail: "Classes, materials and announcements", group: "Coursework", key: "google_classroom", label: "Google Classroom" },
  { connected: true, detail: "Lecture slides and notes", group: "Files", key: "googledrive", label: "Google Drive" },
  { connected: false, detail: "Files from Microsoft 365", group: "Files", key: "one_drive", label: "OneDrive" },
  { connected: true, detail: "School mail and syllabus updates", group: "Mail & dates", key: "gmail", label: "Gmail" },
  { connected: true, detail: "Deadlines, events and study blocks", group: "Mail & dates", key: "googlecalendar", label: "Google Calendar" },
  { connected: false, detail: "Mail and timetable on Microsoft", group: "Mail & dates", key: "outlook", label: "Outlook" },
  { connected: false, detail: "Shared notes and essays", group: "Notes", key: "googledocs", label: "Google Docs" },
  { connected: false, detail: "Lab results and reading trackers", group: "Notes", key: "googlesheets", label: "Google Sheets" },
  { connected: true, detail: "Notes, reading lists and class wikis", group: "Notes", key: "notion", label: "Notion" },
  { connected: false, detail: "Lecture recordings and transcripts", group: "Lectures", key: "zoom", label: "Zoom" },
] as const;

const SMALL_BUTTON =
  "inline-flex h-[34px] items-center justify-center gap-[7px] rounded-[10px] border border-[var(--lab-line)] bg-[var(--lab-panel)] px-[12px] text-[12px] font-medium text-[var(--lab-ink)] transition-colors hover:border-[var(--lab-muted)]";
const PRIMARY_BUTTON =
  "inline-flex h-[36px] items-center justify-center gap-[7px] rounded-[11px] bg-[var(--lab-accent)] px-[14px] text-[12px] font-semibold text-[var(--lab-accent-ink)] transition-opacity hover:opacity-85";

export default function DesignVariationsPage() {
  const [directionId, setDirectionId] = useState<DirectionId>("atlas");
  const [surface, setSurface] = useState<Surface>("projects");
  const direction = DIRECTIONS.find((item) => item.id === directionId) ?? DEFAULT_DIRECTION;
  const selectSurface = (nextSurface: Surface) => {
    setSurface(nextSurface);
    setDirectionId(nextSurface === "apps" ? "precision" : "atlas");
  };

  return (
    <main
      className="min-h-screen p-[18px] text-[#1b1b1b] sm:p-[28px]"
      data-workspace
      style={{ background: "var(--ui-bg-sidebar)", color: "var(--ui-text-primary)" }}
    >
      <section className="mx-auto max-w-[1520px]">
        <header className="mb-[18px] flex flex-col gap-[18px] lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-[8px] flex items-center gap-[8px] text-[11px] font-semibold tracking-[0.16em] text-[#777777] uppercase">
              <NemesisMark size={16} /> Design exploration · 12 screens
            </div>
            <h1 className="text-[30px] leading-[36px] font-semibold tracking-[-0.035em]">Projects, Library & Apps</h1>
            <p className="mt-[5px] max-w-[680px] text-[13px] leading-[20px] text-[#6f6f6f]">
              Selected hybrid: Atlas for Projects and Library, Precision for Apps. The direction cards remain available for comparison.
            </p>
          </div>
          <div className="flex flex-wrap gap-[6px] rounded-[14px] bg-white/70 p-[5px] ring-1 ring-black/5">
            {SURFACES.map((item) => (
              <button
                aria-pressed={surface === item.id}
                className={cn(
                  "h-[34px] rounded-[10px] px-[14px] text-[12px] font-semibold transition-colors",
                  surface === item.id ? "bg-[#181818] text-white" : "text-[#737373] hover:bg-black/5 hover:text-[#181818]",
                )}
                key={item.id}
                onClick={() => selectSurface(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className="mb-[12px] grid gap-[8px] md:grid-cols-2 xl:grid-cols-4">
          {DIRECTIONS.map((item) => {
            const selected = item.id === direction.id;
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "group min-h-[116px] rounded-[16px] border p-[14px] text-left transition-all",
                  selected
                    ? "border-[#181818] bg-[#181818] text-white shadow-[0_12px_30px_rgba(0,0,0,0.14)]"
                    : "border-black/5 bg-white/70 text-[#181818] hover:-translate-y-[1px] hover:border-black/15 hover:bg-white",
                )}
                key={item.id}
                onClick={() => setDirectionId(item.id)}
                type="button"
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-[10px] font-semibold tracking-[0.16em]", selected ? "text-white/50" : "text-black/35")}>{item.number}</span>
                  <ArrowRight className={cn("transition-transform group-hover:translate-x-[2px]", selected ? "text-white/70" : "text-black/30")} size={14} />
                </div>
                <p className="mt-[14px] text-[15px] font-semibold">{item.name}</p>
                <p className={cn("mt-[3px] text-[11px] leading-[16px]", selected ? "text-white/60" : "text-[#777777]")}>{item.promise}</p>
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_24px_80px_rgba(34,34,28,0.18)] ring-1 ring-black/10">
          <div className="flex min-h-[42px] items-center justify-between border-b border-black/8 bg-[#f7f7f7] px-[14px]">
            <div className="flex items-center gap-[7px]">
              <span className="size-[9px] rounded-full bg-black/30" />
              <span className="size-[9px] rounded-full bg-black/20" />
              <span className="size-[9px] rounded-full bg-black/10" />
            </div>
            <div className="rounded-[7px] bg-black/5 px-[12px] py-[5px] text-[10px] font-medium text-[#777777]">
              app.enternemesis.com/{surface}
            </div>
            <div className="w-[46px]" />
          </div>
          <ProductFrame direction={direction} setSurface={selectSurface} surface={surface} />
        </div>

        <footer className="mt-[12px] flex flex-col gap-[5px] px-[4px] text-[11px] leading-[17px] text-[#6f6f6f] sm:flex-row sm:items-center sm:justify-between">
          <p><span className="font-semibold text-[#292929]">{direction.name}:</span> {direction.bestFor}.</p>
          <p>Fixtures reflect the current Nemesis project, output-library and 11-app integration model.</p>
        </footer>
      </section>
    </main>
  );
}

function ProductFrame({
  direction,
  setSurface,
  surface,
}: {
  direction: Direction;
  setSurface: (surface: Surface) => void;
  surface: Surface;
}) {
  return (
    <div
      className="flex min-h-[760px] bg-[var(--lab-bg)] text-[var(--lab-ink)]"
      data-direction={direction.id}
      style={direction.tokens}
    >
      <ProductSidebar direction={direction.id} setSurface={setSurface} surface={surface} />
      <div className="min-w-0 flex-1">
        {direction.id === "precision" && <PrecisionSurface surface={surface} />}
        {direction.id === "atlas" && <AtlasSurface surface={surface} />}
        {direction.id === "workspace" && <WorkspaceSurface surface={surface} />}
        {direction.id === "signal" && <SignalSurface surface={surface} />}
      </div>
    </div>
  );
}

function ProductSidebar({
  direction,
  setSurface,
  surface,
}: {
  direction: DirectionId;
  setSurface: (surface: Surface) => void;
  surface: Surface;
}) {
  const items: readonly { icon: LucideIcon; id?: Surface; label: string }[] = [
    { icon: Sparkles, label: "New chat" },
    { icon: Folder, id: "projects", label: "Projects" },
    { icon: BookOpen, id: "library", label: "Library" },
    { icon: Boxes, id: "apps", label: "Apps" },
    { icon: CalendarDays, label: "Calendar" },
  ];
  return (
    <aside className="hidden w-[196px] shrink-0 flex-col bg-[var(--lab-sidebar)] px-[12px] py-[14px] text-[var(--lab-sidebar-ink)] md:flex">
      <div className="flex h-[38px] items-center gap-[9px] px-[8px]">
        <NemesisMark className="text-[var(--lab-accent)]" size={22} />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Nemesis</span>
      </div>
      <nav className="mt-[18px] space-y-[3px]">
        {items.map((item) => {
          const active = item.id === surface;
          const Icon = item.icon;
          return (
            <button
              className={cn(
                "flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[9px] text-left text-[12px] transition-colors",
                active
                  ? "bg-[var(--lab-accent-soft)] font-semibold text-[var(--lab-ink)]"
                  : "opacity-65 hover:bg-black/5 hover:opacity-100",
              )}
              key={item.label}
              onClick={() => item.id && setSurface(item.id)}
              type="button"
            >
              <Icon size={15} strokeWidth={1.8} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-[24px] px-[9px] text-[9px] font-semibold tracking-[0.13em] opacity-35 uppercase">Recent</div>
      <div className="mt-[7px] space-y-[2px]">
        {PROJECTS.slice(0, 3).map((project) => (
          <div className="flex items-center gap-[8px] rounded-[8px] px-[9px] py-[7px] text-[11px] opacity-55" key={project.name}>
            <span className="size-[6px] rounded-full" style={{ background: project.color }} />
            <span className="truncate">{project.topic}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-[9px] border-t border-current/10 px-[8px] pt-[14px]">
        <div className="flex size-[28px] items-center justify-center rounded-full bg-[var(--lab-accent)] text-[10px] font-bold text-[var(--lab-accent-ink)]">AG</div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium">Axel</p>
          <p className="text-[9px] opacity-45">Student plan</p>
        </div>
      </div>
    </aside>
  );
}

function PageHeader({
  action,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <header className="flex items-end justify-between gap-[18px]">
      <div>
        {eyebrow && <p className="mb-[5px] text-[10px] font-semibold tracking-[0.14em] text-[var(--lab-muted)] uppercase">{eyebrow}</p>}
        <h2 className="text-[27px] leading-[32px] font-semibold tracking-[-0.035em]">{title}</h2>
      </div>
      {action}
    </header>
  );
}

function SearchField({ placeholder }: { placeholder: string }) {
  return (
    <label className="flex h-[36px] w-[220px] items-center gap-[8px] rounded-[11px] border border-[var(--lab-line)] bg-[var(--lab-panel)] px-[11px] text-[var(--lab-muted)]">
      <Search size={14} />
      <span className="text-[11px]">{placeholder}</span>
    </label>
  );
}

function PrecisionSurface({ surface }: { surface: Surface }) {
  return (
    <section className="h-full overflow-y-auto px-[28px] pb-[56px] pt-[72px] lg:px-[54px]">
      <div className="mx-auto max-w-[880px]">
        {surface === "projects" && <PrecisionProjects />}
        {surface === "library" && <PrecisionLibrary />}
        {surface === "apps" && <PrecisionApps />}
      </div>
    </section>
  );
}

function PrecisionProjects() {
  return (
    <>
      <PageHeader
        action={<div className="flex gap-[8px]"><SearchField placeholder="Search projects" /><button className={PRIMARY_BUTTON} type="button"><Plus size={14} />New project</button></div>}
        title="Projects"
      />
      <div className="mt-[42px] flex items-center gap-[6px]">
        {['All', 'Pinned', 'Recently active'].map((label, index) => <button className={cn("h-[32px] rounded-full px-[13px] text-[11px] font-medium", index === 0 ? "bg-[var(--lab-ink)] text-[var(--lab-panel)]" : "text-[var(--lab-muted)] hover:bg-black/5")} key={label} type="button">{label}</button>)}
      </div>
      <div className="mt-[22px] grid grid-cols-[minmax(0,1fr)_82px_118px_32px] items-center border-b border-[var(--lab-line)] pb-[8px] text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-muted)] uppercase">
        <span>Project</span><span>Canvases</span><span>Modified</span><span />
      </div>
      <div>
        {PROJECTS.map((project) => (
          <div className="group grid min-h-[62px] grid-cols-[minmax(0,1fr)_82px_118px_32px] items-center border-b border-[var(--lab-line)] transition-colors hover:bg-black/[0.025]" key={project.name}>
            <div className="flex min-w-0 items-center gap-[12px]">
              <div className="flex size-[32px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--lab-line)] bg-[var(--lab-panel)]"><Folder color={project.color} fill={project.color} fillOpacity={0.16} size={16} /></div>
              <div className="min-w-0"><p className="truncate text-[12px] font-semibold">{project.name}</p><p className="mt-[2px] truncate text-[10px] text-[var(--lab-muted)]">{project.topic}</p></div>
            </div>
            <span className="text-[11px] text-[var(--lab-muted)]">{project.count || '—'}</span>
            <span className="text-[11px] text-[var(--lab-muted)]">{project.time}</span>
            <MoreHorizontal className="opacity-0 transition-opacity group-hover:opacity-60" size={16} />
          </div>
        ))}
      </div>
    </>
  );
}

function PrecisionLibrary() {
  return (
    <>
      <PageHeader action={<div className="flex gap-[8px]"><SearchField placeholder="Search your library" /><button className={PRIMARY_BUTTON} type="button"><Plus size={14} />New</button></div>} title="Library" />
      <div className="mt-[42px] flex items-center justify-between">
        <div className="flex gap-[6px]">{['All', 'Flashcards', 'Slides', 'Documents'].map((label, index) => <button className={cn("h-[32px] rounded-full px-[13px] text-[11px] font-medium", index === 0 ? "bg-[var(--lab-ink)] text-[var(--lab-panel)]" : "text-[var(--lab-muted)] hover:bg-black/5")} key={label} type="button">{label}</button>)}</div>
        <button aria-label="Change view" className={SMALL_BUTTON} type="button"><Table2 size={14} /></button>
      </div>
      <div className="mt-[22px] grid grid-cols-[minmax(0,1fr)_108px_90px_32px] border-b border-[var(--lab-line)] pb-[8px] text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-muted)] uppercase"><span>Name</span><span>Type</span><span>Modified</span><span /></div>
      {LIBRARY_ITEMS.map((item) => (
        <div className="group grid min-h-[62px] grid-cols-[minmax(0,1fr)_108px_90px_32px] items-center border-b border-[var(--lab-line)]" key={item.title}>
          <div className="flex min-w-0 items-center gap-[12px]"><FileTile color={item.accent} kind={item.kind} /><div className="min-w-0"><p className="truncate text-[12px] font-semibold">{item.title}</p><p className="mt-[2px] text-[10px] text-[var(--lab-muted)]">{item.meta}</p></div></div>
          <span className="text-[11px] text-[var(--lab-muted)]">{item.kind}</span><span className="text-[11px] text-[var(--lab-muted)]">{item.when}</span><MoreHorizontal className="opacity-0 group-hover:opacity-60" size={16} />
        </div>
      ))}
    </>
  );
}

function PrecisionApps() {
  const connected = APPS.filter((app) => app.connected);
  const popular = APPS.slice(0, 6);
  const moreApps = APPS.slice(6);
  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader action={<SearchField placeholder="Search apps" />} title="Apps" />
      <section className="mt-[34px]">
        <h3 className="flex items-center gap-[3px] text-[12px] font-semibold">Connected <ChevronRight className="text-[var(--lab-muted)]" size={13} /></h3>
        <div className="mt-[12px] flex flex-wrap gap-[8px]">{connected.map((app) => <AppIcon appKey={app.key} key={app.key} label={app.label} />)}</div>
      </section>
      <h3 className="mt-[30px] text-[12px] font-semibold">Popular</h3>
      <div className="mt-[8px] grid gap-x-[32px] sm:grid-cols-2">
        {popular.map((app) => <AppRow app={app} key={app.key} />)}
      </div>
      <h3 className="mt-[26px] text-[12px] font-semibold">Study &amp; productivity</h3>
      <div className="mt-[8px] grid gap-x-[32px] sm:grid-cols-2">
        {moreApps.map((app) => <AppRow app={app} key={app.key} />)}
      </div>
    </div>
  );
}

function AtlasSurface({ surface }: { surface: Surface }) {
  return (
    <section className="h-full overflow-y-auto px-[28px] pb-[54px] pt-[42px] lg:px-[48px]">
      <div className="mx-auto max-w-[1000px]">
        {surface === "projects" && <AtlasProjects />}
        {surface === "library" && <AtlasLibrary />}
        {surface === "apps" && <AtlasApps />}
      </div>
    </section>
  );
}

function AtlasProjects() {
  return (
    <>
      <div className="flex items-center justify-between gap-[16px]"><h2 className="text-[22px] font-semibold tracking-[-0.03em]">All projects</h2><div className="flex gap-[6px]"><button className={SMALL_BUTTON} type="button"><ListFilter size={13} />Filter</button><button aria-label="Grid view" className={SMALL_BUTTON} type="button"><Grid2X2 size={13} /></button><button className={PRIMARY_BUTTON} type="button"><Plus size={14} />Create project</button></div></div>
      <div className="mt-[16px] grid gap-[24px] md:grid-cols-2">
        {PROJECTS.slice(0, 6).map((project) => <ProjectCard key={project.name} project={project} />)}
      </div>
    </>
  );
}

function AtlasLibrary() {
  return (
    <>
      <PageHeader action={<div className="flex gap-[8px]"><SearchField placeholder="Search library" /><button className={PRIMARY_BUTTON} type="button"><Plus size={14} />Create</button></div>} title="Library" />
      <div className="mt-[42px] flex items-center justify-between gap-[12px]">
        <div className="flex gap-[6px]">{['All', 'Flashcards', 'Slides', 'Documents'].map((label, index) => <button className={cn("h-[32px] rounded-full px-[13px] text-[11px] font-medium", index === 0 ? "bg-[var(--lab-accent-soft)] text-[var(--lab-ink)]" : "text-[var(--lab-muted)] hover:bg-black/5")} key={label} type="button">{label}</button>)}</div>
        <div className="flex gap-[4px]"><button aria-label="Grid view" className="flex size-[34px] items-center justify-center rounded-[9px] text-[var(--lab-muted)] hover:bg-black/5" type="button"><Grid2X2 size={14} /></button><button aria-label="List view" className="flex size-[34px] items-center justify-center rounded-[9px] bg-[var(--lab-accent-soft)] text-[var(--lab-ink)]" type="button"><Table2 size={15} /></button></div>
      </div>
      <div className="mt-[22px] grid grid-cols-[minmax(0,1fr)_112px_72px_32px] border-b border-[var(--lab-line)] pb-[8px] text-[11px] text-[var(--lab-muted)]"><span>Name</span><span>Modified</span><span>Items</span><span /></div>
      {LIBRARY_ITEMS.map((item) => {
        const itemCount = item.kind === "Flashcards" || item.kind === "Folder" ? item.meta.split(" ")[0] : "—";
        return (
          <div className="group grid min-h-[60px] grid-cols-[minmax(0,1fr)_112px_72px_32px] items-center border-b border-[var(--lab-line)] transition-colors hover:bg-black/[0.025]" key={item.title}>
            <div className="flex min-w-0 items-center gap-[12px]"><FileTile color={item.accent} kind={item.kind} /><p className="truncate text-[13px] font-medium">{item.title}</p></div>
            <span className="text-[12px] text-[var(--lab-muted)]">{item.when}</span><span className="text-[12px] text-[var(--lab-muted)]">{itemCount}</span><button aria-label={`Options for ${item.title}`} className="flex size-[28px] items-center justify-center rounded-[8px] text-[var(--lab-muted)] opacity-0 hover:bg-black/5 group-hover:opacity-100 focus-visible:opacity-100" type="button"><MoreHorizontal size={15} /></button>
          </div>
        );
      })}
    </>
  );
}

function AtlasApps() {
  const categories = ['Coursework', 'Files', 'Mail & dates', 'Notes'];
  return (
    <>
      <PageHeader eyebrow="Connected learning" title="Bring your campus with you" />
      <p className="mt-[7px] max-w-[580px] text-[12px] leading-[18px] text-[var(--lab-muted)]">Nemesis can find the right source, deadline or message without making you leave the canvas.</p>
      <div className="mt-[24px] flex gap-[6px] overflow-x-auto pb-[2px]">{['All apps', ...categories].map((label, index) => <button className={cn("h-[34px] shrink-0 rounded-full px-[13px] text-[10px] font-semibold", index === 0 ? "bg-[var(--lab-ink)] text-[var(--lab-panel)]" : "border border-[var(--lab-line)] bg-[var(--lab-panel)] text-[var(--lab-muted)]")} key={label} type="button">{label}</button>)}</div>
      <div className="mt-[26px] grid gap-[12px] sm:grid-cols-2 lg:grid-cols-3">
        {APPS.slice(0, 9).map((app) => (
          <div className="group flex min-h-[156px] flex-col rounded-[18px] border border-[var(--lab-line)] bg-[var(--lab-panel)] p-[16px] transition-transform hover:-translate-y-[2px]" key={app.key}>
            <div className="flex items-start justify-between"><AppIcon appKey={app.key} label={app.label} />{app.connected ? <span className="rounded-full bg-[var(--lab-accent-soft)] px-[8px] py-[4px] text-[9px] font-semibold text-[var(--lab-ink)]">Connected</span> : <Plus className="text-[var(--lab-muted)]" size={16} />}</div>
            <h3 className="mt-[16px] text-[12px] font-semibold">{app.label}</h3><p className="mt-[3px] text-[10px] leading-[15px] text-[var(--lab-muted)]">{app.detail}</p>
            <p className="mt-auto pt-[12px] text-[9px] font-semibold tracking-[0.08em] text-[var(--lab-muted)] uppercase">{app.group}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function WorkspaceSurface({ surface }: { surface: Surface }) {
  return (
    <section className="flex h-full min-h-[760px]">
      {surface === "projects" && <WorkspaceProjects />}
      {surface === "library" && <WorkspaceLibrary />}
      {surface === "apps" && <WorkspaceApps />}
    </section>
  );
}

function WorkspaceColumn({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-w-0 border-r border-[var(--lab-line)] bg-[var(--lab-bg)]", className)}>{children}</div>;
}

function WorkspaceProjects() {
  const [selected, setSelected] = useState(0);
  const project = PROJECTS[selected] ?? PROJECTS[0]!;
  return (
    <>
      <WorkspaceColumn className="hidden w-[182px] shrink-0 p-[14px] lg:block">
        <p className="text-[9px] font-semibold tracking-[0.13em] text-[var(--lab-muted)] uppercase">Project groups</p>
        <div className="mt-[12px] space-y-[2px]">{['All projects', 'Fall 2026', 'Spring 2026', 'Unfiled'].map((label, index) => <button className={cn("flex h-[32px] w-full items-center gap-[8px] rounded-[7px] px-[8px] text-left text-[10px]", index === 0 ? "bg-[var(--lab-accent-soft)] text-[var(--lab-ink)]" : "text-[var(--lab-muted)] hover:bg-white/5")} key={label} type="button"><Folder size={13} />{label}</button>)}</div>
      </WorkspaceColumn>
      <WorkspaceColumn className="flex-1 p-[18px]">
        <div className="flex items-center justify-between"><h2 className="text-[18px] font-semibold">Projects</h2><button className={PRIMARY_BUTTON} type="button"><Plus size={13} />New</button></div>
        <div className="mt-[16px]"><SearchField placeholder="Filter projects" /></div>
        <div className="mt-[16px] space-y-[4px]">{PROJECTS.map((item, index) => <button className={cn("flex w-full items-center gap-[10px] rounded-[9px] p-[9px] text-left", selected === index ? "bg-[var(--lab-accent-soft)]" : "hover:bg-white/[0.035]")} key={item.name} onClick={() => setSelected(index)} type="button"><span className="size-[7px] shrink-0 rounded-full" style={{ background: item.color }} /><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold">{item.name}</span><span className="mt-[2px] block truncate text-[9px] text-[var(--lab-muted)]">{item.topic}</span></span><span className="text-[9px] text-[var(--lab-muted)]">{item.count}</span></button>)}</div>
      </WorkspaceColumn>
      <div className="hidden w-[300px] shrink-0 bg-[var(--lab-panel)] p-[20px] lg:block">
        <div className="flex items-start justify-between"><div className="flex size-[40px] items-center justify-center rounded-[11px] bg-[var(--lab-accent-soft)]"><Folder color={project.color} size={19} /></div><MoreHorizontal size={16} /></div>
        <h3 className="mt-[18px] text-[20px] font-semibold tracking-[-0.03em]">{project.name}</h3><p className="mt-[4px] text-[10px] text-[var(--lab-muted)]">{project.count} canvases · active {project.time.toLowerCase()}</p>
        <div className="mt-[22px] rounded-[11px] border border-[var(--lab-line)] p-[12px]"><p className="text-[9px] font-semibold text-[var(--lab-muted)]">CURRENT THREAD</p><p className="mt-[7px] text-[11px] font-medium">{project.topic}</p><button className="mt-[14px] flex items-center gap-[6px] text-[10px] font-semibold text-[var(--lab-accent)]" type="button"><Play size={12} fill="currentColor" />Resume canvas</button></div>
        <DetailRows rows={[["Progress", `${project.progress}%`], ["Canvases", String(project.count)], ["Last active", project.time], ["Memory", "12 signals"]]} />
      </div>
    </>
  );
}

function WorkspaceLibrary() {
  const [selected, setSelected] = useState(0);
  const item = LIBRARY_ITEMS[selected] ?? LIBRARY_ITEMS[0]!;
  return (
    <>
      <WorkspaceColumn className="hidden w-[190px] shrink-0 p-[14px] lg:block"><p className="text-[9px] font-semibold tracking-[0.13em] text-[var(--lab-muted)] uppercase">Library</p><div className="mt-[12px] space-y-[2px]">{[['All outputs', Layers3], ['Flashcards', GraduationCap], ['Slides', AppWindow], ['Documents', FileText], ['Folders', Folder]].map(([label, Icon], index) => { const Glyph = Icon as LucideIcon; return <button className={cn("flex h-[32px] w-full items-center gap-[8px] rounded-[7px] px-[8px] text-left text-[10px]", index === 0 ? "bg-[var(--lab-accent-soft)]" : "text-[var(--lab-muted)] hover:bg-white/5")} key={String(label)} type="button"><Glyph size={13} />{String(label)}</button>; })}</div><p className="mt-[26px] text-[9px] font-semibold tracking-[0.13em] text-[var(--lab-muted)] uppercase">Folders</p><div className="mt-[8px] space-y-[2px]">{['Fall 2026', 'Week 5 reading', 'PHCY 2105'].map((label) => <div className="flex items-center gap-[8px] px-[8px] py-[6px] text-[10px] text-[var(--lab-muted)]" key={label}><ChevronRight size={11} /><Folder size={12} />{label}</div>)}</div></WorkspaceColumn>
      <WorkspaceColumn className="flex-1 p-[18px]"><div className="flex items-center justify-between"><h2 className="text-[18px] font-semibold">All outputs</h2><button className={PRIMARY_BUTTON} type="button"><Plus size={13} />New</button></div><div className="mt-[16px]"><SearchField placeholder="Filter library" /></div><div className="mt-[16px] space-y-[3px]">{LIBRARY_ITEMS.map((entry, index) => <button className={cn("flex w-full items-center gap-[10px] rounded-[8px] p-[8px] text-left", selected === index ? "bg-[var(--lab-accent-soft)]" : "hover:bg-white/[0.035]")} key={entry.title} onClick={() => setSelected(index)} type="button"><FileTile color={entry.accent} kind={entry.kind} /><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold">{entry.title}</span><span className="mt-[2px] block text-[9px] text-[var(--lab-muted)]">{entry.kind} · {entry.meta}</span></span><span className="text-[9px] text-[var(--lab-muted)]">{entry.when}</span></button>)}</div></WorkspaceColumn>
      <div className="hidden w-[310px] shrink-0 bg-[var(--lab-panel)] p-[20px] lg:block"><div className="flex h-[172px] items-center justify-center overflow-hidden rounded-[14px] border border-[var(--lab-line)] bg-[var(--lab-bg)]"><div className="relative flex size-[96px] items-center justify-center rounded-[20px]" style={{ background: "color-mix(in srgb, var(--lab-accent) 13%, transparent)", color: item.accent }}><FileText size={38} /><span className="absolute -right-[10px] -bottom-[8px] rounded-full bg-[var(--lab-panel)] px-[8px] py-[5px] text-[8px] font-semibold ring-1 ring-[var(--lab-line)]">{item.kind}</span></div></div><h3 className="mt-[18px] text-[16px] leading-[21px] font-semibold">{item.title}</h3><p className="mt-[5px] text-[10px] text-[var(--lab-muted)]">Created by Nemesis · {item.when}</p><div className="mt-[18px] flex gap-[7px]"><button className={PRIMARY_BUTTON} type="button">Open</button><button className={SMALL_BUTTON} type="button"><Share2 size={12} />Share</button></div><DetailRows rows={[["Type", item.kind], ["Contents", item.meta], ["Project", "Thermodynamics"], ["Linked notes", "4"]]} /></div>
    </>
  );
}

function WorkspaceApps() {
  const [selected, setSelected] = useState(2);
  const app = APPS[selected] ?? APPS[0]!;
  return (
    <>
      <WorkspaceColumn className="hidden w-[190px] shrink-0 p-[14px] lg:block"><p className="text-[9px] font-semibold tracking-[0.13em] text-[var(--lab-muted)] uppercase">Categories</p><div className="mt-[12px] space-y-[2px]">{['All apps', 'Connected', 'Coursework', 'Files', 'Mail & dates', 'Notes', 'Lectures'].map((label, index) => <button className={cn("flex h-[32px] w-full items-center gap-[8px] rounded-[7px] px-[8px] text-left text-[10px]", index === 0 ? "bg-[var(--lab-accent-soft)]" : "text-[var(--lab-muted)] hover:bg-white/5")} key={label} type="button"><Boxes size={13} />{label}</button>)}</div></WorkspaceColumn>
      <WorkspaceColumn className="flex-1 p-[18px]"><div className="flex items-center justify-between"><h2 className="text-[18px] font-semibold">Apps</h2><span className="rounded-full bg-[var(--lab-accent-soft)] px-[9px] py-[5px] text-[9px] font-semibold">5 connected</span></div><div className="mt-[16px]"><SearchField placeholder="Find an app" /></div><div className="mt-[16px] space-y-[3px]">{APPS.map((entry, index) => <button className={cn("flex w-full items-center gap-[10px] rounded-[8px] p-[8px] text-left", selected === index ? "bg-[var(--lab-accent-soft)]" : "hover:bg-white/[0.035]")} key={entry.key} onClick={() => setSelected(index)} type="button"><div className="scale-[0.82]"><AppIcon appKey={entry.key} label={entry.label} /></div><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold">{entry.label}</span><span className="mt-[2px] block truncate text-[9px] text-[var(--lab-muted)]">{entry.detail}</span></span>{entry.connected ? <Check className="text-[var(--lab-accent)]" size={13} /> : <Plus className="text-[var(--lab-muted)]" size={13} />}</button>)}</div></WorkspaceColumn>
      <div className="hidden w-[310px] shrink-0 bg-[var(--lab-panel)] p-[20px] lg:block"><AppIcon appKey={app.key} label={app.label} /><h3 className="mt-[16px] text-[18px] font-semibold">{app.label}</h3><p className="mt-[6px] text-[10px] leading-[16px] text-[var(--lab-muted)]">{app.detail}. Nemesis uses this connection only when it helps answer your request.</p><button className={cn("mt-[18px] w-full", app.connected ? SMALL_BUTTON : PRIMARY_BUTTON)} type="button">{app.connected ? 'Manage connection' : 'Connect app'}</button><div className="mt-[24px] border-t border-[var(--lab-line)] pt-[16px]"><p className="text-[9px] font-semibold tracking-[0.11em] text-[var(--lab-muted)] uppercase">Access</p>{[['Read', 'Allowed'], ['Create', 'Ask first'], ['Delete', 'Ask first']].map(([label, value]) => <div className="flex items-center justify-between border-b border-[var(--lab-line)] py-[9px] text-[10px]" key={label}><span>{label}</span><span className="text-[var(--lab-muted)]">{value}</span></div>)}</div></div>
    </>
  );
}

function SignalSurface({ surface }: { surface: Surface }) {
  return (
    <section className="h-full overflow-y-auto px-[28px] pb-[54px] pt-[36px] lg:px-[42px]">
      <div className="mx-auto max-w-[1040px]">
        {surface === "projects" && <SignalProjects />}
        {surface === "library" && <SignalLibrary />}
        {surface === "apps" && <SignalApps />}
      </div>
    </section>
  );
}

function SignalProjects() {
  return (
    <>
      <PageHeader action={<button className={PRIMARY_BUTTON} type="button"><Plus size={14} />New project</button>} eyebrow="Thursday, September 4" title="What deserves your attention" />
      <div className="mt-[22px] grid gap-[12px] lg:grid-cols-[1.45fr_1fr]">
        <div className="rounded-[20px] bg-[var(--lab-ink)] p-[20px] text-[var(--lab-panel)]"><div className="flex items-center gap-[7px] text-[9px] font-semibold tracking-[0.12em] text-[var(--lab-panel)]/45 uppercase"><Sparkles size={12} />Recommended next</div><h3 className="mt-[24px] max-w-[480px] text-[21px] leading-[26px] font-semibold tracking-[-0.03em]">Return to entropy while yesterday’s correction is still fresh.</h3><div className="mt-[20px] flex items-center justify-between"><p className="text-[10px] text-[var(--lab-panel)]/50">Thermodynamics · 12 minute session</p><button className="flex size-[34px] items-center justify-center rounded-full bg-[var(--lab-accent)] text-[var(--lab-accent-ink)]" type="button"><ArrowRight size={15} /></button></div></div>
        <div className="grid grid-cols-2 gap-[10px]">{[["5", "active projects"], ["72%", "strongest mastery"], ["3", "due this week"], ["14", "learning signals"]].map(([value, label], index) => <div className="rounded-[17px] border border-[var(--lab-line)] bg-[var(--lab-panel)] p-[15px]" key={label}><div className={cn("mb-[18px] size-[7px] rounded-full bg-[var(--lab-accent)]", index === 2 && "opacity-45")} /><p className="text-[22px] font-semibold tracking-[-0.04em]">{value}</p><p className="mt-[2px] text-[9px] text-[var(--lab-muted)]">{label}</p></div>)}</div>
      </div>
      <div className="mt-[26px] flex items-center justify-between"><h3 className="text-[13px] font-semibold">Project signals</h3><button className={SMALL_BUTTON} type="button"><ListFilter size={13} />Sort</button></div>
      <div className="mt-[10px] grid gap-[10px] md:grid-cols-2">{PROJECTS.slice(0, 4).map((project, index) => <div className="rounded-[16px] border border-[var(--lab-line)] bg-[var(--lab-panel)] p-[14px]" key={project.name}><div className="flex items-center gap-[10px]"><span className="size-[8px] rounded-full" style={{ background: project.color }} /><p className="min-w-0 flex-1 truncate text-[11px] font-semibold">{project.name}</p><span className="text-[9px] text-[var(--lab-muted)]">{project.progress}%</span></div><p className="mt-[12px] text-[10px] leading-[15px] text-[var(--lab-muted)]">{index === 0 ? 'Two concepts are ready for a retrieval check.' : index === 1 ? 'One correction has not been revisited.' : index === 2 ? 'Strong recall across the last three reviews.' : 'No activity in the last seven days.'}</p><div className="mt-[13px] h-[3px] overflow-hidden rounded-full bg-[var(--lab-line)]"><div className="h-full rounded-full bg-[var(--lab-accent)]" style={{ width: `${project.progress}%` }} /></div></div>)}</div>
    </>
  );
}

function SignalLibrary() {
  return (
    <>
      <PageHeader action={<div className="flex gap-[7px]"><button className={SMALL_BUTTON} type="button"><Upload size={13} />Import</button><button className={PRIMARY_BUTTON} type="button"><Plus size={14} />Create</button></div>} eyebrow="Knowledge layer" title="Library signals" />
      <div className="mt-[22px] grid gap-[12px] lg:grid-cols-3">
        <div className="rounded-[19px] border border-[var(--lab-line)] bg-[var(--lab-panel)] p-[18px] lg:col-span-2"><div className="flex items-center justify-between"><div className="flex items-center gap-[7px] text-[10px] font-semibold"><WandSparkles className="text-[var(--lab-accent)]" size={14} />Connections Nemesis found</div><span className="rounded-full bg-[var(--lab-accent-soft)] px-[8px] py-[4px] text-[9px] font-semibold">3 new</span></div><div className="mt-[18px] grid gap-[9px] sm:grid-cols-2">{[["Duty of care", "Statistical power", "Both hinge on thresholds of sufficient evidence."], ["Renal physiology", "Thermodynamics", "Concentration gradients connect the two topics."]].map(([a, b, copy]) => <button className="rounded-[13px] border border-[var(--lab-line)] bg-[var(--lab-bg)] p-[12px] text-left" key={a}><div className="flex items-center gap-[6px] text-[9px] font-semibold"><span>{a}</span><ArrowRight className="text-[var(--lab-accent)]" size={11} /><span>{b}</span></div><p className="mt-[8px] text-[9px] leading-[14px] text-[var(--lab-muted)]">{copy}</p></button>)}</div></div>
        <div className="rounded-[19px] bg-[var(--lab-accent-soft)] p-[18px]"><div className="flex size-[30px] items-center justify-center rounded-[9px] bg-[var(--lab-accent)] text-[var(--lab-accent-ink)]"><Zap size={14} /></div><p className="mt-[20px] text-[22px] font-semibold tracking-[-0.04em]">153</p><p className="text-[9px] text-[var(--lab-muted)]">documents and outputs</p><p className="mt-[14px] text-[10px] leading-[15px]">7,086 searchable chunks are ready when you ask.</p></div>
      </div>
      <div className="mt-[26px] flex items-center justify-between"><h3 className="text-[13px] font-semibold">Recently made</h3><SearchField placeholder="Search library" /></div>
      <div className="mt-[10px] grid gap-[10px] sm:grid-cols-2 lg:grid-cols-3">{LIBRARY_ITEMS.map((item) => <div className="rounded-[15px] border border-[var(--lab-line)] bg-[var(--lab-panel)] p-[13px]" key={item.title}><FileTile color={item.accent} kind={item.kind} /><p className="mt-[13px] line-clamp-2 text-[11px] leading-[16px] font-semibold">{item.title}</p><div className="mt-[12px] flex items-center justify-between text-[9px] text-[var(--lab-muted)]"><span>{item.meta}</span><span>{item.when}</span></div></div>)}</div>
    </>
  );
}

function SignalApps() {
  return (
    <>
      <PageHeader action={<SearchField placeholder="Search apps" />} eyebrow="Your learning network" title="Apps that make Nemesis useful" />
      <div className="mt-[22px] grid gap-[12px] lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-[20px] border border-[var(--lab-line)] bg-[var(--lab-panel)] p-[18px]"><div className="flex items-center justify-between"><h3 className="text-[11px] font-semibold">Connected flow</h3><span className="text-[9px] text-[var(--lab-muted)]">Healthy</span></div><div className="mt-[24px] flex items-center justify-between gap-[8px]">{APPS.filter((app) => app.connected).slice(0, 4).map((app, index) => <div className="contents" key={app.key}><div className="flex flex-col items-center gap-[8px]"><AppIcon appKey={app.key} label={app.label} /><span className="max-w-[72px] truncate text-[9px] text-[var(--lab-muted)]">{app.label}</span></div>{index < 3 && <ArrowRight className="shrink-0 text-[var(--lab-line)]" size={15} />}</div>)}</div><p className="mt-[22px] rounded-[11px] bg-[var(--lab-bg)] p-[10px] text-[9px] leading-[14px] text-[var(--lab-muted)]">Canvas dates become Calendar events; Drive files become Library sources; Gmail changes can update both.</p></div>
        <div className="rounded-[20px] bg-[var(--lab-ink)] p-[18px] text-[var(--lab-panel)]"><div className="flex items-center gap-[7px] text-[9px] font-semibold tracking-[0.1em] text-[var(--lab-panel)]/45 uppercase"><Sparkles size={12} />Suggested</div><p className="mt-[22px] text-[17px] leading-[22px] font-semibold">Connect Google Classroom to bring in announcements your current flow cannot see.</p><button className="mt-[18px] inline-flex items-center gap-[6px] text-[10px] font-semibold text-[var(--lab-accent)]" type="button">Review connection <ArrowRight size={12} /></button></div>
      </div>
      <div className="mt-[26px] flex items-center justify-between"><h3 className="text-[13px] font-semibold">All capabilities</h3><span className="text-[9px] text-[var(--lab-muted)]">Writes always ask first</span></div>
      <div className="mt-[10px] grid gap-[9px] sm:grid-cols-2 lg:grid-cols-3">{APPS.slice(0, 9).map((app) => <div className="flex items-center gap-[10px] rounded-[14px] border border-[var(--lab-line)] bg-[var(--lab-panel)] p-[11px]" key={app.key}><div className="scale-[0.76]"><AppIcon appKey={app.key} label={app.label} /></div><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold">{app.label}</p><p className="mt-[2px] truncate text-[9px] text-[var(--lab-muted)]">{app.detail}</p></div>{app.connected ? <Check className="text-[var(--lab-accent)]" size={13} /> : <Plus className="text-[var(--lab-muted)]" size={13} />}</div>)}</div>
    </>
  );
}

function FileTile({ color, kind }: { color: string; kind: string }) {
  const Icon = kind === "Folder" ? Folder : kind === "Flashcards" ? Layers3 : kind === "Slides" ? AppWindow : FileText;
  return <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--lab-line)] bg-[var(--lab-panel)]" style={{ color }}><Icon size={15} /></span>;
}

/** Identity-bearing assets keep their native color against the restrained product chrome. */
function AppIcon({ appKey, label }: { appKey: string; label: string }) {
  return <span className="inline-flex"><PluginIcon appKey={appKey} label={label} /></span>;
}

function AppRow({ app }: { app: (typeof APPS)[number] }) {
  return (
    <div className="flex min-h-[64px] items-center gap-[12px] py-[6px]">
      <AppIcon appKey={app.key} label={app.label} />
      <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{app.label}</p><p className="mt-[1px] truncate text-[11px] text-[var(--lab-muted)]">{app.detail}</p></div>
      <button aria-label={app.connected ? `Actions for ${app.label}` : `Connect ${app.label}`} className="flex size-[32px] shrink-0 items-center justify-center rounded-[9px] text-[var(--lab-muted)] hover:bg-black/5 hover:text-[var(--lab-ink)]" type="button">{app.connected ? <MoreHorizontal size={17} /> : <Plus size={17} />}</button>
    </div>
  );
}

function ProjectCard({ project }: { project: (typeof PROJECTS)[number] }) {
  return (
    <button className="flex min-h-[112px] flex-col rounded-[12px] bg-[var(--lab-panel)] p-[16px] text-left shadow-[inset_0_0_0_1px_var(--lab-line)] transition-[background-color,transform] hover:bg-[var(--lab-bg)] active:scale-[0.98]" type="button">
      <h3 className="truncate text-[14px] leading-[21px] font-medium">{project.name}</h3>
      <p className="mt-auto pt-[12px] text-[12px] leading-[18px] text-[var(--lab-muted)]">{project.time}</p>
    </button>
  );
}

function DetailRows({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return <div className="mt-[22px] border-t border-[var(--lab-line)] pt-[8px]">{rows.map(([label, value]) => <div className="flex items-center justify-between border-b border-[var(--lab-line)] py-[9px] text-[10px]" key={label}><span className="text-[var(--lab-muted)]">{label}</span><span className="font-medium">{value}</span></div>)}</div>;
}
