"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { SearchResult } from "@pharmabro/shared";
import { searchEntities } from "@/lib/api";
import { Badge, Card, ErrorText, PageHeader } from "@/components/ui";

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

  return (
    <>
      <PageHeader title="Explore" eyebrow="Search">
        Search by brand, generic, supplement, peptide, or evidence topic.
      </PageHeader>
      <Card>
        <form className="row" onSubmit={onSubmit}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ozempic, sertraline, creatine…" />
          <button disabled={busy} type="submit">{busy ? "Searching…" : "Search"}</button>
        </form>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Card>
      <ul className="list">
        {results.map((r) => (
          <li key={r.id}>
            <Card>
              <div className="row">
                <div>
                  <h2>{r.name}</h2>
                  <p className="muted">{r.subtitle || r.type}</p>
                </div>
                <Badge>{r.status}</Badge>
              </div>
              <Link className="source-link" href={`/app/drugs/${r.id}`}>Open page</Link>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
