"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { SearchResult } from "@pharmabro/shared";
import { searchEntities } from "@/lib/api";
import { Badge, Card, ErrorText } from "@/components/ui";

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

const filters = [
  ["Approved", "#1a8c5c"],
  ["Investigational", "#0278c0"],
  ["Research Use", "#c97b06"],
  ["Supplement", "#6d28d9"],
];

const classes = ["GLP-1s", "SSRIs", "ACE Inhibitors", "Peptides", "Beta-blockers", "Statins", "Supplements", "Immunology"];

export default function ExplorePage() {
  const [query, setQuery] = useState("ozempic");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResults(await searchEntities(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  const cards = results.length ? results.map((r) => ({
    id: r.id,
    name: r.name,
    subtitle: r.subtitle ?? r.type,
    status: r.status,
    bg: popular.find((p) => p.id === r.id)?.bg ?? "#1a6b4a",
  })) : popular;

  return (
    <div className="explore-layout">
      <aside className="filter-rail">
        <div className="eyebrow">Status</div>
        <div className="stack" style={{ gap: 4, marginBottom: 22 }}>
          {filters.map(([label, color], index) => (
            <div className={index === 0 ? "filter-item active" : "filter-item"} key={label}>
              <span className="filter-dot" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
        <div className="eyebrow">Classes</div>
        <div className="stack" style={{ gap: 2 }}>
          {classes.map((item) => <div className="filter-item" key={item}>{item}</div>)}
        </div>
      </aside>

      <section className="content">
        <form className="row" onSubmit={onSubmit} style={{ marginBottom: 18 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ozempic, sertraline, creatine..." />
          <button disabled={busy} type="submit">{busy ? "Searching..." : "Search"}</button>
        </form>
        {error ? <ErrorText>{error}</ErrorText> : null}

        <div className="eyebrow">{results.length ? "Search results" : "Popular now"}</div>
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

        <div className="eyebrow">Trending trials</div>
        <div className="updates-list">
          {["Obesity & metabolic syndrome - 12 active trials", "Alzheimer's disease - 8 active trials", "Oncology Phase 3 - 24 active trials"].map((trial) => (
            <Card key={trial}>
              <div className="row">
                <span>{trial}</span>
                <Badge>active</Badge>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
