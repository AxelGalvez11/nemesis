"use client";

import { useEffect, useRef, useState } from "react";
import {
  FEATURED_QUERIES,
  GRADE_CONFIG,
  lookupDrug,
  type DrugResult,
} from "@/lib/demoData";
import { FeaturedQueryIcon, PrecautionIcon, SearchIcon } from "@/components/icons";

type ConsoleState =
  | { phase: "empty" }
  | { phase: "loading" }
  | { phase: "result"; drug: DrugResult };

/**
 * The interactive "Analysis Console" demo — featured drug-combo buttons + a console that
 * renders a graded, cited answer. Auto-loads the first featured query when it scrolls into
 * view. Ports the prototype's demo engine; the result is rendered as escaped React JSX
 * (never innerHTML), and the freeform search bar from v2 is intentionally absent (v3).
 */
export function InteractiveDemo() {
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [state, setState] = useState<ConsoleState>({ phase: "empty" });
  const [claimsVisible, setClaimsVisible] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `activeQuery` mirrored in a ref so runQuery's same-query guard is read synchronously.
  const activeQueryRef = useRef<string | null>(null);

  function runQuery(q: string) {
    if (activeQueryRef.current === q) return;
    activeQueryRef.current = q;
    setActiveQuery(q);
    setClaimsVisible(false);
    setState({ phase: "loading" });

    if (loadTimer.current) clearTimeout(loadTimer.current);
    // Simulate network delay (matches the prototype's 700ms), then reveal claims.
    loadTimer.current = setTimeout(() => {
      const drug = lookupDrug(q);
      setState({ phase: "result", drug });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setClaimsVisible(true)),
      );
    }, 700);
  }

  // Auto-load the first featured query when the demo section scrolls into view.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    let played = false;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !played) {
          played = true;
          obs.disconnect();
          autoTimer.current = setTimeout(
            () => runQuery(FEATURED_QUERIES[0].query),
            300,
          );
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(section);
    return () => {
      obs.disconnect();
      if (autoTimer.current) clearTimeout(autoTimer.current);
      if (loadTimer.current) clearTimeout(loadTimer.current);
    };
    // runQuery only touches refs, module constants, and stable setters (no captured state),
    // so the empty dep array is intentional — this wires the observer once on mount.
  }, []);

  return (
    <section className="section demo" id="demo" ref={sectionRef}>
      <div className="container">
        <div className="demo-head">
          <div className="section-tag reveal">Interactive demo</div>
          <h2 className="section-h2 reveal d1">Every answer shows its work</h2>
          <p className="section-p reveal d2">
            Select a query below or search any drug combination — every claim is graded and
            traced to its source.
          </p>
        </div>

        {/* Layout */}
        <div className="demo-layout reveal d4">
          {/* Sidebar: featured queries */}
          <div className="demo-sidebar" id="demo-sidebar">
            <p className="sidebar-label">Featured queries</p>
            {FEATURED_QUERIES.map((fq) => (
              <button
                key={fq.query}
                type="button"
                className={`query-btn${activeQuery === fq.query ? " active" : ""}`}
                onClick={() => runQuery(fq.query)}
              >
                <div className="query-btn-icon">
                  <FeaturedQueryIcon icon={fq.icon} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: 600, lineHeight: 1.3 }}>
                    {fq.label}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--t35)" }}>
                    {fq.sublabel}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Console */}
          <div className="demo-console">
            <div className="console-topbar">
              <div className="console-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="console-title">Analysis Console</span>
              <div style={{ width: "48px" }} />
            </div>
            <div className="console-body" id="console-body">
              <ConsoleContent state={state} claimsVisible={claimsVisible} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConsoleContent({
  state,
  claimsVisible,
}: {
  state: ConsoleState;
  claimsVisible: boolean;
}) {
  if (state.phase === "empty") {
    return (
      <div className="console-empty">
        <div className="console-empty-icon">
          <SearchIcon size={22} strokeWidth={1.75} />
        </div>
        <p>Select a featured query or type a drug name above to see a fully cited analysis.</p>
      </div>
    );
  }

  if (state.phase === "loading") {
    return (
      <div className="console-loading">
        <div className="console-spinner" />
        <p>Running synthesis…</p>
      </div>
    );
  }

  return <ResultView drug={state.drug} claimsVisible={claimsVisible} />;
}

function ResultView({
  drug,
  claimsVisible,
}: {
  drug: DrugResult;
  claimsVisible: boolean;
}) {
  const gc = GRADE_CONFIG[drug.grade] ?? GRADE_CONFIG.unknown;
  return (
    <div className="result-enter">
      <div className="result-header">
        <div>
          <div className="result-name">{drug.name}</div>
          <div className="result-category">{drug.category}</div>
        </div>
        <span
          className="grade-badge"
          style={{ background: gc.bg, border: `1px solid ${gc.border}`, color: gc.color }}
        >
          <span className="gdot" style={{ background: gc.color }} />
          {gc.label}
        </span>
      </div>
      <p className="result-summary">{drug.summary}</p>
      <p className="claims-label">Verified claims matrix</p>
      <div className="claims-list">
        {drug.claims.map((c, i) => (
          <div
            key={i}
            className={`claim-item${claimsVisible ? " visible" : ""}`}
            style={{ transitionDelay: `${i * 0.12}s` }}
          >
            <div className="claim-num">{String(i + 1).padStart(2, "0")}</div>
            <div className="claim-body">
              <p className="claim-text">{c.text}</p>
              <div className="claim-cites">
                {c.cites.map((ct, j) => (
                  <span key={j} className="cite-chip">
                    {ct.source}
                    <span className="cite-sub"> · {ct.cat}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      {drug.precaution && (
        <div className="result-precaution">
          <div className="prec-icon">
            <PrecautionIcon />
          </div>
          <p className="prec-text">
            <strong>Clinical note:</strong> {drug.precaution}
          </p>
        </div>
      )}
      <div className="result-actions">
        <button type="button" className="act-p">
          Open sources
        </button>
        <button type="button" className="act-s">
          Save result
        </button>
        <button type="button" className="act-s">
          Follow topic
        </button>
      </div>
    </div>
  );
}
