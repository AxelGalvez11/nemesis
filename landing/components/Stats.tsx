"use client";

import { useEffect, useRef, useState } from "react";

const COUNTERS = [
  { target: 12, suffix: "M+", label: ["Scientific records", "indexed across sources"] },
  { target: 500, suffix: "K+", label: ["Biomedical studies", "continuously monitored"] },
  { target: 5, suffix: "", label: ["Evidence source lanes", "open and traceable"] },
  { target: 6, suffix: "", label: ["Evidence tiers", "never a black box"] },
] as const;

export function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<number[]>(() => COUNTERS.map(() => 0));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ran = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (ran || !entries[0].isIntersecting) return;
        ran = true;
        observer.disconnect();
        const dur = 1800;
        let start: number | null = null;
        const frame = (ts: number) => {
          if (start === null) start = ts;
          const prog = Math.min((ts - start) / dur, 1);
          const eased = 1 - Math.pow(1 - prog, 3);
          setValues(COUNTERS.map((c) => (prog < 1 ? Math.floor(eased * c.target) : c.target)));
          if (prog < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="stats" ref={ref}>
      <div className="stats-grid">
        {COUNTERS.map((c, i) => (
          <div key={i} className={`stat-item reveal${i > 0 ? ` d${i}` : ""}`}>
            <div className="stat-num">
              <span>{values[i]}</span>
              {c.suffix && <span style={{ color: "var(--mint)" }}>{c.suffix}</span>}
            </div>
            <div className="stat-label">
              {c.label[0]}
              <br />
              {c.label[1]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
