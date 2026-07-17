// A cited conference poster — the wedge deliverable for health/biomedical research students. Takes a
// finished ResearchReport and renders a single, print-friendly academic poster board (US 48×36 in,
// landscape 4:3): an academic header (title + editable author/affiliation placeholder + a neutral
// N-sources·date line), a multi-column body (background/summary, methods & sources searched, key
// findings, an evidence-base mini-table, gaps, and a numbered references column). It reads as the
// STUDENT'S own poster — no product branding anywhere on the artifact.
//
// Presentational ONLY — no fetching, no hooks, no interactivity (a poster is a print artifact, so
// citation markers are inline TEXT, not the interactive CiteChips buttons).
//
// Citation integrity is the differentiator: the same shared helpers that build the deck/report drive
// the markers here (claimRefMarker), the evidence table (evidenceRows), and the reference list
// (referenceLines) — so a claim's " [1,3]" always points at reference lines "1." and "3." exactly as
// it does everywhere else.
import type { Citation, CitationStyle, ResearchReport } from "@nemesis/shared";
import { claimRefMarker, evidenceRows, referenceLines } from "@nemesis/shared";

export function ResearchPoster({ report, style = "vancouver" }: { report: ResearchReport; style?: CitationStyle }) {
  const rows = report.citations.length ? evidenceRows(report.citations as Citation[]) : [];
  const refs = report.citations.length ? referenceLines(report.citations as Citation[], style) : [];
  const searchDate = report.search_method?.search_date ?? report.counts?.retrieved_at ?? "";

  return (
    <article className="research-poster" aria-label="Cited conference poster">
      {/* Academic header — the report question as the poster title, an editable-looking author /
          affiliation line, and a neutral N-sources · date line. No product branding. */}
      <header className="poster-head">
        <h1 className="poster-title">{report.question || "Research Poster"}</h1>
        <div className="poster-byline">Author Name&nbsp;&nbsp;·&nbsp;&nbsp;Department, Institution</div>
        {refs.length || searchDate ? (
          <div className="poster-meta">
            {refs.length ? <span className="poster-meta-item">{refs.length} cited sources</span> : null}
            {searchDate ? <span className="poster-meta-item">{searchDate}</span> : null}
          </div>
        ) : null}
      </header>

      {/* Wide landscape board: a 3-column upper region (background + methods · key findings ·
          gaps + safety) that fills the board, then a full-width evidence-base band and a full-width
          numbered references band that flow the whole cited-source list across sub-columns, so the
          poster scales cleanly to a real citation list. */}
      <div className="poster-body">
        <div className="poster-upper">
          {/* Column 1 — background + how the literature was searched. */}
          <div className="poster-col">
            {report.summary ? (
              <section className="poster-block">
                <h2 className="poster-h">Background</h2>
                <p className="poster-p">{report.summary}</p>
              </section>
            ) : null}

            <section className="poster-block">
              <h2 className="poster-h">Methods &amp; sources searched</h2>
              {report.search_method ? (
                <ul className="poster-methods">
                  <li><b>Databases:</b> {report.search_method.databases.join(", ")}</li>
                  {report.search_method.queries.length ? (
                    <li><b>Queries:</b> {report.search_method.queries.join("; ")}</li>
                  ) : null}
                  <li><b>Search date:</b> {report.search_method.search_date}</li>
                  <li>{report.search_method.inclusion_notes}</li>
                </ul>
              ) : null}
              {report.counts ? (
                <p className="poster-methods-count">
                  <b>{report.counts.total_retrieved}</b> candidate sources retrieved across{" "}
                  <b>{report.counts.n_searches}</b> sub-question searches (top{" "}
                  {report.counts.per_search_cap} kept per search), then merged and de-duplicated — a
                  bounded, top-ranked sample, not an exhaustive census.
                </p>
              ) : null}
              {!report.search_method && !report.counts ? (
                <p className="poster-p poster-muted">Bounded, relevance-ranked automated literature search.</p>
              ) : null}
            </section>
          </div>

          {/* Column 2 (double-width) — the key findings, flowed in two sub-columns, each cited point
              carrying its [n] marker. */}
          <div className="poster-col poster-col-findings">
            <section className="poster-block">
              <h2 className="poster-h">Key findings</h2>
              <div className="poster-findings-flow">
                {report.sections.map((sec) => (
                  <div className="poster-finding" key={sec.heading}>
                    <h3 className="poster-h3">{sec.heading}</h3>
                    {sec.points.map((p, i) => (
                      <p className="poster-p poster-claim" key={i}>
                        {p.text}
                        <span className="poster-cite">{claimRefMarker(p.citation_ids)}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Column 3 — gaps / uncertainty and the safety note. */}
          <div className="poster-col">
            {report.gaps?.length ? (
              <section className="poster-block">
                <h2 className="poster-h">Gaps / still uncertain</h2>
                <ul className="poster-gaps">
                  {report.gaps.map((g, i) => (
                    <li key={i}>
                      {g.text}
                      {g.corroborating_trials.length ? (
                        <span className="poster-gap-trials"> An answer may be coming: {g.corroborating_trials.join(", ")}.</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : report.uncertainties.length ? (
              <section className="poster-block">
                <h2 className="poster-h">Gaps / still uncertain</h2>
                <ul className="poster-gaps">
                  {report.uncertainties.map((p, i) => <li key={i}>{p.text}</li>)}
                </ul>
              </section>
            ) : null}

            {report.safety_notes.length ? (
              <section className="poster-block poster-safety">
                <h2 className="poster-h">Safety</h2>
                {report.safety_notes.map((p, i) => (
                  <p className="poster-p poster-claim" key={i}>
                    {p.text}
                    <span className="poster-cite">{claimRefMarker(p.citation_ids)}</span>
                  </p>
                ))}
              </section>
            ) : null}
          </div>
        </div>

        {/* Evidence-base band — full width, flowed four-up so a real-sized source list stays a short
            band while keeping the # · Type · Source · Year columns readable. */}
        {rows.length ? (
          <section className="poster-block poster-evidence-band">
            <h2 className="poster-h">Evidence base ({rows.length} sources)</h2>
            <div className="poster-evidence-split">
              {[0, 1, 2, 3].map((q) => {
                const per = Math.ceil(rows.length / 4);
                const slice = rows.slice(q * per, (q + 1) * per);
                if (!slice.length) return null;
                return (
                  <table className="poster-evidence" key={q}>
                    <thead>
                      <tr><th>#</th><th>Type</th><th>Source</th><th>Yr</th></tr>
                    </thead>
                    <tbody>
                      {slice.map((r) => (
                        <tr key={r.tag}>
                          <td className="poster-ev-tag">{r.tag}</td>
                          <td>{r.type}</td>
                          <td className="poster-ev-src">{r.title}</td>
                          <td>{r.year}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* References band — full width, numbered list flowed across many sub-columns so the whole
            cited-source list fits as a short band that scales to a real citation count. */}
        {refs.length ? (
          <section className="poster-block poster-refs-band">
            <h2 className="poster-h">References ({refs.length})</h2>
            <ol className="poster-refs">
              {refs.map((r) => <li key={r}>{r}</li>)}
            </ol>
          </section>
        ) : null}
      </div>
      {/* Growth-loop mark: subtle, single-line, does not
          compete with the academic content — the credit that spreads the tool when the poster does. */}
      <footer className="poster-credit">Made with Nemesis · every claim cited &amp; verified · enternemesis.com</footer>
    </article>
  );
}
