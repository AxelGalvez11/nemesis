// A cited conference poster — the wedge deliverable for health/biomedical research students. Takes a
// finished ResearchReport and renders a single, print-friendly academic poster board (landscape,
// multi-column): title band, background/summary, methods & sources searched, key findings (every
// cited point carries its [n] marker), an evidence-base mini-table, gaps, and a numbered references
// column. Presentational ONLY — no fetching, no hooks, no interactivity (a poster is a print artifact,
// so citation markers are inline TEXT, not the interactive CiteChips buttons).
//
// Citation integrity is the differentiator: the same shared helpers that build the deck/report drive
// the markers here (claimRefMarker), the evidence table (evidenceRows), the reference list
// (referenceLines), and the "built from" recap (buildAttribution) — so a claim's " [1,3]" always
// points at reference lines "1." and "3." exactly as it does everywhere else.
import type { Citation, CitationStyle, ResearchReport } from "@pharmabro/shared";
import { buildAttribution, claimRefMarker, evidenceRows, referenceLines } from "@pharmabro/shared";

/** Growth-loop footer strip — the "Made with PharmaOrb" attribution on every shared artifact. */
function PosterFooter() {
  return (
    <div className="poster-footer">
      <span className="poster-footer-mark">Made with PharmaOrb</span>
      <span className="poster-footer-sep">·</span>
      <span className="poster-footer-note">verify every source</span>
    </div>
  );
}

export function ResearchPoster({ report, style = "vancouver" }: { report: ResearchReport; style?: CitationStyle }) {
  const rows = report.citations.length ? evidenceRows(report.citations as Citation[]) : [];
  const refs = report.citations.length ? referenceLines(report.citations as Citation[], style) : [];
  const attribution = report.citations.length
    ? buildAttribution({
        citations: report.citations,
        generatedAt: report.search_method?.search_date ?? "",
        mode: (report.mode ?? "standard").replace(/_/g, " "),
      })
    : null;

  return (
    <article className="research-poster" aria-label="Cited conference poster">
      {/* Header band — the report question as the poster title. */}
      <header className="poster-head">
        <div className="poster-kicker">PharmaOrb · Evidence Poster</div>
        <h1 className="poster-title">{report.question || "Evidence Poster"}</h1>
        <div className="poster-meta">
          <span className="poster-grade">{report.evidence_grade.replace(/_/g, " ")}</span>
          <span className="poster-verify">
            {report.claims_verified ? "Every claim checked against its cited source" : "Not fully fact-checked — treat with caution"}
          </span>
          {attribution ? <span className="poster-builtfrom">{attribution.headline}</span> : null}
        </div>
      </header>

      {/* Three-column body. Left = background + methods; middle = findings; right = evidence + refs. */}
      <div className="poster-body">
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
        </div>

        <div className="poster-col">
          <section className="poster-block">
            <h2 className="poster-h">Key findings</h2>
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
          </section>

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

        <div className="poster-col">
          {rows.length ? (
            <section className="poster-block">
              <h2 className="poster-h">Evidence base ({rows.length} sources)</h2>
              <table className="poster-evidence">
                <thead>
                  <tr><th>#</th><th>Type</th><th>Year</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.tag}>
                      <td className="poster-ev-tag">{r.tag}</td>
                      <td>{r.type}</td>
                      <td>{r.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {refs.length ? (
            <section className="poster-block">
              <h2 className="poster-h">References ({refs.length})</h2>
              <ol className="poster-refs">
                {refs.map((r) => <li key={r}>{r}</li>)}
              </ol>
            </section>
          ) : null}
        </div>
      </div>

      <PosterFooter />
    </article>
  );
}
