"use client";

// Score page — the "Percentile Engine" MVP (one feature, web-first, off-nav until enabled).
// Non-diagnostic: it places your values on a reference-population percentile and rolls them into
// pillar scores + one composite rank, computed live by the PURE shared engine. No disease labels,
// no clinical thresholds. Manual entry now; wearable/lab ingestion is a later phase.

import { useMemo, useState } from "react";
import {
  type AgeBand,
  METRICS,
  type MetricInput,
  type MetricKey,
  type Pillar,
  percentileFor,
  PILLARS,
  scoreHealth,
  type Sex,
  TIER_LABEL,
} from "@pharmabro/shared";
import { Orb } from "@/components/Orb";
import "./score.css";

// The metrics offered in the manual-entry form, with a realistic demo value for the "fill sample" button.
const ENTRY: { key: MetricKey; demo: string }[] = [
  { key: "vo2max", demo: "50" },
  { key: "hba1c", demo: "5.1" },
  { key: "apob", demo: "80" },
  { key: "hscrp", demo: "0.6" },
  { key: "resting_hr", demo: "56" },
  { key: "hrv", demo: "62" },
  { key: "grip_strength", demo: "55" },
  { key: "lean_mass_index", demo: "19.5" },
  { key: "sleep_efficiency", demo: "92" },
];

const PILLAR_SUBTITLE: Record<Pillar, string> = {
  metabolic: "VO₂ max · HbA1c",
  cardiovascular: "ApoB · hs-CRP · resting HR",
  recovery: "HRV · sleep efficiency",
  strength: "grip strength · lean mass",
  pace_of_aging: "add an epigenetic test",
};

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export default function ScorePage() {
  const [sex, setSex] = useState<Sex>("male");
  const [ageBand, setAgeBand] = useState<AgeBand>("30-39");
  const [values, setValues] = useState<Record<string, string>>({});

  // Recompute the whole score whenever a value, sex, or age band changes.
  const { result, percentiles } = useMemo(() => {
    const percentiles = new Map<MetricKey, number>();
    const inputs: MetricInput[] = [];
    for (const { key } of ENTRY) {
      const raw = values[key];
      if (raw == null || raw.trim() === "") continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      const pct = percentileFor(METRICS[key], num, sex, ageBand);
      percentiles.set(key, pct);
      inputs.push({ key, percentile: pct });
    }
    return { result: scoreHealth(inputs), percentiles };
  }, [values, sex, ageBand]);

  const setValue = (key: MetricKey, v: string) => setValues((prev) => ({ ...prev, [key]: v }));
  const fillDemo = () => setValues(Object.fromEntries(ENTRY.map((e) => [e.key, e.demo])));

  const composite = result.composite;
  const hasAny = composite !== null;
  // Glow scales with the composite so the orb literally brightens as you rank higher.
  const glow = hasAny ? 0.25 + (composite / 100) * 0.6 : 0.2;

  // The share-card "flex" pills: the three highest percentiles entered.
  const topPills = [...percentiles.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="sc-wrap">
      <div className="sc-top">
        <div>
          <h1>Your Score</h1>
          <div className="sc-sub">Longevity rank · vs. {sex === "male" ? "men" : "women"} {ageBand}</div>
        </div>
        <button className="sc-share" type="button" title="Shareable stat card — coming in a later phase">
          ⇪ Share card
        </button>
      </div>

      {/* HERO: orb + composite | share-card preview */}
      <div className="sc-hero">
        <div className="sc-card sc-hero-score">
          <div
            className="sc-orb"
            // rgba() can't take a CSS custom property list directly as its color channels in all
            // browsers via a template string, so we build the color from --orb-rgb (the PINNED
            // PharmaOrb brand color, not the Manus --acid accent) using a CSS var() with fallback.
            style={{ filter: `drop-shadow(0 0 ${Math.round(glow * 70)}px rgba(var(--orb-rgb, 98, 176, 0), ${glow.toFixed(2)}))` }}
          >
            <Orb size={150} />
          </div>
          <div>
            <div className="sc-label">Composite rank</div>
            {hasAny ? (
              <>
                <div className="sc-num">{composite}<sup>{ordinal(composite)}</sup></div>
                <div className="sc-tier">◆ {result.tier ? TIER_LABEL[result.tier] : ""}</div>
                <div className="sc-meta">
                  You rank above <b>{composite}%</b> of your demographic.<br />
                  Based on {percentiles.size} metric{percentiles.size === 1 ? "" : "s"} — add more to sharpen it.
                </div>
              </>
            ) : (
              <>
                <div className="sc-num sc-empty">—</div>
                <div className="sc-meta">Enter a value or two below to see where you stand.</div>
              </>
            )}
          </div>
        </div>

        <div className="sc-card sc-stat">
          <div className="sc-tag">Share preview</div>
          <div className="sc-card-in">
            <div className="sc-who">You · {sex === "male" ? "M" : "F"} {ageBand}</div>
            <div className="sc-big">{hasAny ? composite : "—"}<span>{hasAny ? ordinal(composite) : ""}</span></div>
            <div className="sc-flex">
              {hasAny ? `Top ${100 - composite}% longevity rank.` : "Your rank, ready to share."}
            </div>
            <div className="sc-pills">
              {topPills.length > 0
                ? topPills.map(([key, pct]) => (
                    <div key={key} className="sc-pill">{METRICS[key].label} <b>{pct}{ordinal(pct)}</b></div>
                  ))
                : <div className="sc-pill">Add data to populate</div>}
            </div>
            <div className="sc-foot">
              <div className="sc-wm"><div className="sc-dot" />Pharma<span>Orb</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* WHAT CHANGED — the living-science hook (demo content until monitoring is wired in) */}
      <div className="sc-changed">
        <div className="sc-pulse" />
        <div className="sc-txt">
          <b>How the living score will work:</b> when monitoring finds a major new study affecting a
          metric in your stack, your rank updates and you’ll see why — framed as the science, not a verdict.
        </div>
        <div className="sc-when">preview</div>
        <span className="sc-go">Learn more →</span>
      </div>

      {/* PILLARS */}
      <div className="sc-pillars">
        {result.pillars.map((p) => {
          const locked = p.percentile === null;
          return (
            <div key={p.pillar} className={`sc-card sc-pc${locked ? " sc-locked" : ""}`}>
              <div className="sc-pc-top"><div className="sc-label">{p.label}</div></div>
              {locked ? (
                <>
                  <div className="sc-pc-num">—</div>
                  <div className="sc-pc-tier">{PILLAR_SUBTITLE[p.pillar]}</div>
                  {p.pillar === "pace_of_aging" ? <button className="sc-add" type="button">+ Add data</button> : null}
                </>
              ) : (
                <>
                  <div className="sc-pc-num">{p.percentile}<sup>{ordinal(p.percentile as number)}</sup></div>
                  <div className="sc-pc-tier">{p.tier ? TIER_LABEL[p.tier] : ""} · {PILLAR_SUBTITLE[p.pillar]}</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* LOWER: trajectory (sample) + how to move up */}
      <div className="sc-lower">
        <div className="sc-card sc-blk">
          <h3>Your trajectory</h3>
          <div className="sc-hint">Sample — your real trend builds as you log readings over time</div>
          <svg width="100%" height="150" viewBox="0 0 460 150" preserveAspectRatio="none" style={{ opacity: 0.55 }}>
            <line x1="0" y1="120" x2="460" y2="120" stroke="var(--line)" />
            <line x1="0" y1="80" x2="460" y2="80" stroke="var(--line)" opacity="0.5" />
            <line x1="0" y1="40" x2="460" y2="40" stroke="var(--line)" opacity="0.5" />
            <polyline points="0,108 80,100 160,96 240,78 320,70 400,58 460,46" fill="none" stroke="var(--acid)" strokeWidth="2.5" strokeDasharray="5 5" />
          </svg>
        </div>

        <div className="sc-card sc-blk">
          <h3>How to move up</h3>
          <div className="sc-hint">Percentile-framed, from current literature — not medical advice</div>
          <ul className="sc-moveup">
            <li><span className="sc-cite">[1]</span><span>To climb the cardiovascular percentile, literature points toward Zone 2 cardio 3–4×/week.</span></li>
            <li><span className="sc-cite">[2]</span><span>Higher dietary fiber is associated with lower ApoB in similar cohorts.</span></li>
            <li><span className="sc-cite">[3]</span><span>Sleep regularity tracks with HRV gains in the trials behind the Recovery pillar.</span></li>
          </ul>
          <div className="sc-clin">Always discuss any changes with your clinician. PharmaOrb informs; it doesn’t prescribe.</div>
        </div>
      </div>

      {/* INPUTS / ENTRY — manual for now; wearable + lab upload come later */}
      <div className="sc-card sc-inputs">
        <h3>
          Your data
          <button className="sc-demo" type="button" onClick={fillDemo}>fill sample values</button>
        </h3>
        <div className="sc-grid" style={{ marginBottom: 14 }}>
          <div className="sc-field">
            <label htmlFor="sc-sex">Sex (for the reference group)</label>
            <div className="sc-inrow">
              <select id="sc-sex" value={sex} onChange={(e) => setSex(e.target.value as Sex)}
                style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>
          <div className="sc-field">
            <label htmlFor="sc-age">Age band</label>
            <div className="sc-inrow">
              <select id="sc-age" value={ageBand} onChange={(e) => setAgeBand(e.target.value as AgeBand)}
                style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
                {(["18-29", "30-39", "40-49", "50-59", "60-69", "70+"] as AgeBand[]).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="sc-grid">
          {ENTRY.map(({ key }) => {
            const pct = percentiles.get(key);
            return (
              <div key={key} className="sc-field">
                <label htmlFor={`sc-${key}`}>{METRICS[key].label}</label>
                <div className="sc-inrow">
                  <input
                    id={`sc-${key}`}
                    inputMode="decimal"
                    placeholder="—"
                    value={values[key] ?? ""}
                    onChange={(e) => setValue(key, e.target.value)}
                  />
                  <span className="sc-unit">{METRICS[key].unit}</span>
                  <span className="sc-pct">{pct != null ? `${pct}${ordinal(pct)}` : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sc-disclaim">
        <b>Informational only — not a medical diagnosis or device.</b> Percentiles compare you to a
        reference population (NHANES + cohort norms), not to a clinical threshold. Reference data shown
        here is illustrative pending real-dataset integration. Discuss your health decisions with a licensed clinician.
      </div>
    </div>
  );
}
