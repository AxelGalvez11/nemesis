"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { SearchResult } from "@pharmabro/shared";
import { searchEntities } from "@/lib/api";
import { ErrorText } from "@/components/ui";

const popular = [
  { id: "semaglutide", name: "Semaglutide", status: "approved", bg: "#1a3b78", subtitle: "Ozempic, Wegovy, Rybelsus" },
  { id: "tirzepatide", name: "Tirzepatide", status: "approved", bg: "#0278c0", subtitle: "Mounjaro, Zepbound" },
  { id: "retatrutide", name: "Retatrutide", status: "investigational", bg: "#1563b5", subtitle: "Triple agonist candidate" },
  { id: "bpc-157", name: "BPC-157", status: "research_use", bg: "#7a4f00", subtitle: "Research peptide" },
  { id: "creatine", name: "Creatine", status: "supplement", bg: "#5b21b6", subtitle: "Sports nutrition" },
  { id: "sertraline", name: "Sertraline", status: "approved", bg: "#1a6b4a", subtitle: "SSRI" },
  { id: "metformin", name: "Metformin", status: "approved", bg: "#14532d", subtitle: "Biguanide" },
  { id: "atorvastatin", name: "Atorvastatin", status: "approved", bg: "#1e3a5f", subtitle: "Statin" },
  { id: "berberine", name: "Berberine", status: "supplement", bg: "#713f12", subtitle: "Supplement" },
];

const statusColors: Record<string, string> = {
  approved: "#1a8c5c",
  investigational: "#0278c0",
  research_use: "#c97b06",
  supplement: "#6d28d9",
  unknown: "#6b7280",
};

const filters: Array<{ label: string; color: string; value: string }> = [
  { label: "Approved", color: "#1a8c5c", value: "approved" },
  { label: "Investigational", color: "#0278c0", value: "investigational" },
  { label: "Research Use", color: "#c97b06", value: "research_use" },
  { label: "Supplement", color: "#6d28d9", value: "supplement" },
];

const classes = ["GLP-1", "SSRI", "ACE Inhibitor", "Peptide", "Beta-blocker", "Statin", "Supplement", "Immunology"];

export default function ExplorePage() {
  const [query, setQuery] = useState("ozempic");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  async function runSearch(q: string) {
    setBusy(true);
    setError(null);
    try {
      setResults(await searchEntities(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch(query);
  }

  const baseCards = results.length ? results.map((r) => ({
    id: r.id,
    name: r.name,
    subtitle: r.subtitle ?? r.type,
    status: r.status,
    bg: popular.find((p) => p.id === r.id)?.bg ?? "#1a6b4a",
  })) : popular;
  const cards = statusFilter ? baseCards.filter((c) => c.status === statusFilter) : baseCards;

  return (
    <div className="explore-layout">
      <aside className="filter-rail">
        <div className="eyebrow">Status</div>
        <div className="stack" style={{ gap: 4, marginBottom: 22 }}>
          {filters.map((f) => (
            <button
              type="button"
              className={statusFilter === f.value ? "filter-item active" : "filter-item"}
              key={f.label}
              aria-pressed={statusFilter === f.value}
              onClick={() => setStatusFilter((cur) => (cur === f.value ? null : f.value))}
            >
              <span className="filter-dot" style={{ background: f.color }} />
              {f.label}
            </button>
          ))}
        </div>
        <div className="eyebrow">Classes</div>
        <div className="stack" style={{ gap: 2 }}>
          {classes.map((item) => (
            <button type="button" className="filter-item" key={item} onClick={() => { setQuery(item); void runSearch(item); }}>
              {item}
            </button>
          ))}
        </div>
      </aside>

      {/* The .content column has no CSS of its own and this page is full-bleed, so the scoped
          padding here gives the search + grid the calm breathing room the design calls for. */}
      <section className="content" style={{ padding: "28px 32px" }}>
        <form className="row" onSubmit={onSubmit} style={{ marginBottom: 22, gap: 10 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search drugs — ozempic, sertraline, creatine…" aria-label="Search drugs" />
          <button disabled={busy} type="submit">{busy ? "Searching…" : "Search"}</button>
        </form>
        {error ? <ErrorText>{error}</ErrorText> : null}

        <div className="eyebrow" style={{ marginBottom: 12 }}>
          {results.length ? "Search results" : "Popular now"}
          {statusFilter ? ` · ${statusFilter.replaceAll("_", " ")}` : ""}
        </div>
        <div className="drug-grid">
          {cards.map((drug) => (
            <Link className="drug-tile" href={`/app/drugs/${drug.id}`} key={drug.id}>
              <div className="drug-tile-art" style={{ background: `linear-gradient(135deg, ${drug.bg}cc, ${drug.bg})` }}>{drug.name[0]}</div>
              <div className="drug-tile-body">
                <h2>{drug.name}</h2>
                <p className="muted">{drug.subtitle}</p>
                <div className="status-line" style={{ color: statusColors[drug.status] ?? statusColors.unknown }}>
                  <span className="filter-dot" style={{ background: statusColors[drug.status] ?? statusColors.unknown }} />
                  {drug.status.replaceAll("_", " ")}
                </div>
              </div>
            </Link>
          ))}
        </div>
        {cards.length === 0 ? <p className="muted">No {statusFilter?.replaceAll("_", " ")} matches in this view.</p> : null}
      </section>
    </div>
  );
}
