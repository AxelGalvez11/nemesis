"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchResearchReports, type ResearchReportSummary } from "@/lib/api";
import { displayReportTitle } from "@pharmabro/shared";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";
import { getCached, setCached } from "@/lib/cache";

// Per-device (localStorage) persistence for favorites + view mode. Honest, real client state — not
// server data. Keys are read/written inside effects (never a useState initializer) so the first
// server-rendered paint matches the client and localStorage isn't touched during SSR.
const FAVORITES_KEY = "report-favorites";
const VIEW_KEY = "library-view";
type ViewMode = "grid" | "list";

// Report-kind buckets a saved report's `mode` column can fold into for the type filter. This mirrors
// the EXACT relabeling ask/page.tsx's ResearchRunCard already does ("standard" and "meta" are both
// user-facing "Deep research" — the pooled pipeline is one tool now) — so the filter never shows two
// chips for what the user sees as one report type, and never invents a kind ("Posters"/"Slides") that
// saved_reports.mode can't actually hold.
type ModeBucket = "deep_research" | "structured_review" | "discovery" | "lab_draft";
const BUCKET_LABEL: Record<ModeBucket, string> = {
  deep_research: "Deep research",
  structured_review: "Systematic review",
  discovery: "Discovery",
  lab_draft: "Lab draft",
};
const BUCKET_ICON: Record<ModeBucket, "sparkle" | "doc" | "compute" | "calc"> = {
  deep_research: "sparkle",
  structured_review: "doc",
  discovery: "compute",
  lab_draft: "calc",
};
function modeBucket(mode: string): ModeBucket {
  return mode === "structured_review" || mode === "discovery" || mode === "lab_draft" ? mode : "deep_research";
}

type Filter = "all" | ModeBucket;

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Day-bucket label for a group header, in the user's local time zone. Manus groups by source task; a
// saved report has no "task" concept, so day-bucketing is our closest honest analogue. Falls back to
// "Earlier" for a missing/invalid created_at rather than dropping the row.
function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear()
    ? { month: "long", day: "numeric" }
    : { month: "long", day: "numeric", year: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

// Relative "N days/weeks ago" for the group header's right-aligned timestamp (Manus shows e.g.
// "Yesterday, 4:38 PM" next to the task name) — real elapsed time from the group's newest report.
function relativeTime(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.round(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// First couple of lines of a report's real summary, for the card's light-surface preview body — an
// honest text preview (the report's own bottom-line summary), never a fabricated screenshot.
function previewLines(summary: string | undefined): string | null {
  if (!summary) return null;
  const collapsed = summary.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > 220 ? `${collapsed.slice(0, 217)}…` : collapsed;
}

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

interface DayGroup { key: string; label: string; timestamp: string; reports: ResearchReportSummary[]; }

// Bucket already-filtered, newest-first reports into day sections. Order is preserved from the input
// (reports arrive newest-first from the API, so groups come out newest-first too).
function groupByDay(list: ResearchReportSummary[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const r of list) {
    const label = dayLabel(r.created_at, now);
    let g = byKey.get(label);
    if (!g) {
      g = { key: label, label, timestamp: r.created_at, reports: [] };
      byKey.set(label, g);
      groups.push(g);
    }
    g.reports.push(r);
  }
  return groups;
}

// The Library: every deep-research report the user has generated, shown as a Manus-style card grid
// (or compact list) grouped by day, with always-on search, a type filter, a favorites filter
// (per-device star toggles), and a grid/list view toggle.
export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ResearchReportSummary[] | null>(() => getCached<ResearchReportSummary[]>("reports") ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<Filter>("all");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const typeMenuRef = useRef<HTMLDivElement | null>(null);

  // Load reports from the API.
  useEffect(() => {
    let alive = true;
    fetchResearchReports()
      .then((r) => { if (alive) { setReports(r); setCached("reports", r); } })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load reports."); });
    return () => { alive = false; };
  }, []);

  // Read per-device prefs after mount (localStorage is client-only). Marking `hydrated` afterward lets
  // the persist effects below skip the initial default-write that would otherwise clobber stored values.
  useEffect(() => {
    setFavorites(readFavorites());
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "list") setView(v);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* ignore */ }
  }, [favorites, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }
  }, [view, hydrated]);

  // Close the type-filter dropdown on outside click / Escape (mirrors AppShell's row-menu pattern).
  useEffect(() => {
    if (!typeMenuOpen) return;
    const onDoc = (e: MouseEvent) => { if (!typeMenuRef.current?.contains(e.target as Node)) setTypeMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTypeMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [typeMenuOpen]);

  const toggleFavorite = (id: string) =>
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // The distinct kinds that actually occur in the loaded reports — never a hardcoded list, so the
  // dropdown can't offer a bucket with zero matching reports.
  const availableBuckets = useMemo(() => {
    if (!reports) return [];
    const seen = new Set<ModeBucket>();
    for (const r of reports) seen.add(modeBucket(r.mode));
    return (["deep_research", "structured_review", "discovery", "lab_draft"] as ModeBucket[]).filter((b) => seen.has(b));
  }, [reports]);

  const filtered = useMemo(() => {
    if (!reports) return null;
    const q = query.trim().toLowerCase();
    const favSet = new Set(favorites);
    return reports.filter((r) => {
      if (favOnly && !favSet.has(r.id)) return false;
      if (typeFilter !== "all" && modeBucket(r.mode) !== typeFilter) return false;
      if (q && !displayReportTitle(r.title).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [reports, query, favOnly, typeFilter, favorites]);

  // Recomputed on every render (cheap — a few dozen rows at most) rather than pinned to mount, so a
  // Library left open across midnight re-buckets "Today" into "Yesterday" on the next state change.
  const now = new Date();
  const groups = filtered ? groupByDay(filtered, now) : null;

  const hasReports = (reports?.length ?? 0) > 0;
  const typeFilterLabel = typeFilter === "all" ? "All" : BUCKET_LABEL[typeFilter];

  return (
    <div className="lib-wrap">
      <header className="lib-head">
        <h2 className="lib-title">Library</h2>
        <div className="lib-controls">
          <div className="lib-filter-wrap" ref={typeMenuRef}>
            <button type="button" className={typeFilter !== "all" ? "lib-seg-btn active" : "lib-seg-btn"}
              onClick={() => setTypeMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={typeMenuOpen}>
              <Icon name="filter" size={13} /> {typeFilterLabel} <Icon name="chevron-down" size={13} />
            </button>
            {typeMenuOpen ? (
              <div className="lib-filter-menu" role="menu">
                <button type="button" role="menuitemradio" aria-checked={typeFilter === "all"}
                  onClick={() => { setTypeFilter("all"); setTypeMenuOpen(false); }}>
                  <Icon name="grid" size={14} /> All
                  {typeFilter === "all" ? <Icon name="check" size={13} className="lib-filter-check" /> : null}
                </button>
                {availableBuckets.map((b) => (
                  <button type="button" key={b} role="menuitemradio" aria-checked={typeFilter === b}
                    onClick={() => { setTypeFilter(b); setTypeMenuOpen(false); }}>
                    <Icon name={BUCKET_ICON[b]} size={14} /> {BUCKET_LABEL[b]}
                    {typeFilter === b ? <Icon name="check" size={13} className="lib-filter-check" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" className={favOnly ? "lib-seg-btn active" : "lib-seg-btn"}
            onClick={() => setFavOnly((v) => !v)} aria-pressed={favOnly}>
            <Icon name="star" size={13} /> My favorites
          </button>
          <div className="lib-search">
            <Icon name="search" size={15} />
            <input className="lib-search-input" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search library…" aria-label="Search library" />
          </div>
          <div className="lib-seg" role="group" aria-label="View">
            <button type="button" className={view === "grid" ? "lib-seg-btn icon active" : "lib-seg-btn icon"}
              onClick={() => setView("grid")} aria-label="Grid view" aria-pressed={view === "grid"} title="Grid view">
              <Icon name="grid" size={15} />
            </button>
            <button type="button" className={view === "list" ? "lib-seg-btn icon active" : "lib-seg-btn icon"}
              onClick={() => setView("list")} aria-label="List view" aria-pressed={view === "list"} title="List view">
              <Icon name="list" size={15} />
            </button>
          </div>
          <button type="button" className="mode lib-new-btn" onClick={() => router.push("/app/ask")}>
            <Icon name="plus" size={14} /> New report
          </button>
        </div>
      </header>

      {err ? <p className="tmpl-note">{err}</p> : null}
      {reports === null && !err ? <SkeletonRows count={3} label="Loading your reports…" /> : null}

      {reports && !hasReports ? (
        <div className="lib-empty">
          <Icon name="folder" size={30} />
          <p className="lib-empty-title">Nothing in the library yet</p>
          <p className="lib-empty-sub">Start by generating a report — open the <b>+</b> menu in <Link href="/app/ask">Ask</Link> and choose Deep research or Discovery.</p>
        </div>
      ) : null}

      {groups && hasReports ? (
        groups.length === 0 ? (
          <p className="lib-nomatch">
            {query.trim()
              ? `No reports match “${query.trim()}”.`
              : favOnly && typeFilter === "all"
              ? "No favorites yet — tap the star on a report to save it here."
              : typeFilter !== "all"
              ? `No ${BUCKET_LABEL[typeFilter]} reports${favOnly ? " in your favorites" : ""} yet.`
              : "No favorites yet — tap the star on a report to save it here."}
          </p>
        ) : (
          <div className="lib-groups">
            {groups.map((g) => (
              <section key={g.key} className="lib-group">
                <div className="lib-group-head">
                  <h3 className="lib-group-title">{g.label}</h3>
                  <span className="lib-group-time">{relativeTime(g.timestamp, now)}</span>
                </div>
                <div className={view === "grid" ? "lib-grid" : "lib-list"}>
                  {g.reports.map((r) => {
                    const isFav = favorites.includes(r.id);
                    const title = displayReportTitle(r.title);
                    const preview = view === "grid" ? previewLines(r.summary) : null;
                    return (
                      <div key={r.id} className="lib-card">
                        <Link href={`/app/reports/${r.id}`} className="lib-card-link" title={title}>
                          <span className="lib-card-row">
                            <span className="lib-card-icon"><Icon name="doc" size={view === "grid" ? 18 : 15} /></span>
                            <span className="lib-card-title">{title}</span>
                          </span>
                          {preview ? (
                            <span className="lib-card-preview">
                              <span className="lib-card-preview-title">{title}</span>
                              <span className="lib-card-preview-body">{preview}</span>
                            </span>
                          ) : null}
                          <span className="lib-card-meta">
                            <span>{BUCKET_LABEL[modeBucket(r.mode)]}</span>
                            <span className="lib-card-dot">·</span>
                            {r.created_at ? <><span>{shortDate(r.created_at)}</span><span className="lib-card-dot">·</span></> : null}
                            <span>{r.citation_count} {r.citation_count === 1 ? "source" : "sources"}</span>
                          </span>
                        </Link>
                        <button type="button" className={isFav ? "lib-fav on" : "lib-fav"}
                          onClick={() => toggleFavorite(r.id)} aria-pressed={isFav}
                          aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                          title={isFav ? "Remove from favorites" : "Add to favorites"}>
                          <Icon name="star" size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
