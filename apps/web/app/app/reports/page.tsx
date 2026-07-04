"use client";

import { useEffect, useMemo, useState } from "react";
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
type Filter = "all" | "favorites";

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

// The Library: every deep-research report the user has generated, shown as a Manus-style card grid
// (or compact list) with always-on search, a favorites filter (per-device star toggles), and a
// grid/list view toggle. Flat filtered grid — no per-kind grouping headers.
export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ResearchReportSummary[] | null>(() => getCached<ResearchReportSummary[]>("reports") ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

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

  const toggleFavorite = (id: string) =>
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Flat filter: favorites (if active) then title search. No per-kind grouping.
  const filtered = useMemo(() => {
    if (!reports) return null;
    const q = query.trim().toLowerCase();
    const favSet = new Set(favorites);
    return reports.filter((r) => {
      if (filter === "favorites" && !favSet.has(r.id)) return false;
      if (q && !displayReportTitle(r.title).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [reports, query, filter, favorites]);

  const hasReports = (reports?.length ?? 0) > 0;

  return (
    <div className="lib-wrap">
      <header className="lib-head">
        <h2 className="lib-title">Library</h2>
        <div className="lib-controls">
          <div className="lib-search">
            <Icon name="search" size={15} />
            <input className="lib-search-input" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search library…" aria-label="Search library" />
          </div>
          <div className="lib-seg" role="group" aria-label="Filter">
            <button type="button" className={filter === "all" ? "lib-seg-btn active" : "lib-seg-btn"}
              onClick={() => setFilter("all")}>All</button>
            <button type="button" className={filter === "favorites" ? "lib-seg-btn active" : "lib-seg-btn"}
              onClick={() => setFilter("favorites")} aria-pressed={filter === "favorites"}>
              <Icon name="star" size={13} /> My favorites
            </button>
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

      {filtered && hasReports ? (
        filtered.length === 0 ? (
          <p className="lib-nomatch">
            {filter === "favorites" && !query.trim()
              ? "No favorites yet — tap the star on a report to save it here."
              : `No reports match “${query.trim()}”.`}
          </p>
        ) : (
          <div className={view === "grid" ? "lib-grid" : "lib-list"}>
            {filtered.map((r) => {
              const isFav = favorites.includes(r.id);
              const title = displayReportTitle(r.title);
              return (
                <div key={r.id} className="lib-card">
                  <Link href={`/app/reports/${r.id}`} className="lib-card-link" title={title}>
                    <span className="lib-card-icon"><Icon name="doc" size={view === "grid" ? 18 : 15} /></span>
                    <span className="lib-card-title">{title}</span>
                    <span className="lib-card-meta">
                      {r.created_at ? <span>{shortDate(r.created_at)}</span> : null}
                      {r.created_at ? <span className="lib-card-dot">·</span> : null}
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
        )
      ) : null}
    </div>
  );
}
