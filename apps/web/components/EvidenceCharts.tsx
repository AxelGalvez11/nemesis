"use client";

import type { Citation } from "@pharmabro/shared";
import { buildEvidenceTimeline, buildStudyDesignChart } from "@pharmabro/shared";

// A report section holding whichever evidence figures the real data supports. Renders nothing (no empty
// heading) when neither chart clears its honesty threshold. Gate the call site on engineVisualsEnabled.
export function EvidenceChartsSection({ citations }: { citations: Citation[] }) {
  const hasDesign = buildStudyDesignChart(citations) != null;
  const hasTimeline = buildEvidenceTimeline(citations) != null;
  if (!hasDesign && !hasTimeline) return null;
  return (
    <section className="research-section">
      <h4 className="research-heading">Evidence at a glance</h4>
      {hasDesign ? <StudyDesignChart citations={citations} /> : null}
      {hasTimeline ? <EvidenceTimeline citations={citations} /> : null}
    </section>
  );
}

// Evidence distribution figures — the study-design mix and publications-by-year of a report's REAL
// sources. Geometry is the shared, pure build* (computed from citation metadata — never an LLM-drawn
// figure); this only paints the model in theme CSS variables. Each renders nothing when its build*
// returns null (too little real data to be honest), so the report stays silent rather than misleading.

/** Horizontal bars of the report's study-design mix (RCTs / meta-analyses / observational / …). */
export function StudyDesignChart({ citations }: { citations: Citation[] }) {
  const m = buildStudyDesignChart(citations);
  if (!m) return null;
  const barH = 16;
  return (
    <figure className="evidence-chart" style={{ margin: "0 0 6px" }}>
      <svg
        viewBox={`0 0 ${m.width} ${m.height}`}
        width="100%"
        style={{ maxWidth: m.width }}
        role="img"
        aria-label="Study-design breakdown of the cited sources"
        fontSize={12}
      >
        {m.bars.map((b) => {
          const cy = b.y + b.rowH / 2;
          return (
            <g key={b.label}>
              <text x={m.labelX} y={cy + 4} fill="var(--text)">{b.label}</text>
              <rect x={b.barX} y={cy - barH / 2} width={b.barW} height={barH} rx={3} fill="var(--acid)" />
              <text x={b.barX + b.barW + 8} y={cy + 4} fill="var(--text-2)" fontFamily="var(--mono)" fontSize={11}>
                {b.count}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption style={{ color: "var(--text-3)", fontFamily: "var(--mono)", fontSize: 11, marginTop: 2 }}>
        {m.coverageNote}
      </figcaption>
    </figure>
  );
}

/** Vertical bars of publications per year across the cited evidence (gap years show as zero bars). */
export function EvidenceTimeline({ citations }: { citations: Citation[] }) {
  const m = buildEvidenceTimeline(citations);
  if (!m) return null;
  // Label the first year, the last year, and the peak year — sparse enough to never crowd the axis.
  const peak = m.bars.reduce((a, b) => (b.count > a.count ? b : a)); // m.bars is non-empty (else build returned null)
  const labelYears = new Set<number>([m.minYear, m.maxYear, peak.year]);
  return (
    <figure className="evidence-chart" style={{ margin: "0 0 6px" }}>
      <svg
        viewBox={`0 0 ${m.width} ${m.height}`}
        width="100%"
        style={{ maxWidth: m.width }}
        role="img"
        aria-label={`Publications per year, ${m.minYear} to ${m.maxYear}`}
        fontSize={11}
      >
        {/* baseline axis */}
        <line x1={0} y1={m.axisY} x2={m.width} y2={m.axisY} stroke="var(--text-2)" strokeWidth={1} />
        {m.bars.map((b) => (
          <g key={b.year}>
            {b.h > 0 ? <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} fill="var(--acid)" /> : null}
            {b.count > 0 && b.count === m.maxCount ? (
              <text x={b.x + b.w / 2} y={b.y - 4} textAnchor="middle" fill="var(--text-2)" fontFamily="var(--mono)" fontSize={10}>
                {b.count}
              </text>
            ) : null}
            {labelYears.has(b.year) ? (
              <text x={b.x + b.w / 2} y={m.axisY + 14} textAnchor="middle" fill="var(--text-3)" fontFamily="var(--mono)" fontSize={10}>
                {b.year}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </figure>
  );
}
