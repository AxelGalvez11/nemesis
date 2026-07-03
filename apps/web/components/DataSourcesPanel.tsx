"use client";

import { DATA_SOURCES, type DataSource } from "@/lib/data-sources";

// A modal that shows what powers PharmaOrb's answers: live sources (fetched per question) and the
// embedded library (ingested corpus). Honest — it names sources and how they're used, never ranking
// internals; and it re-states that news sits OUTSIDE the cited evidence.
export function DataSourcesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const live = DATA_SOURCES.filter((s) => s.category === "live");
  const library = DATA_SOURCES.filter((s) => s.category === "library");
  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div className="confirm-card" role="dialog" aria-modal="true" aria-label="Data sources" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, textAlign: "left", maxHeight: "80vh", overflowY: "auto" }}>
        <h3 className="confirm-title">What powers your answers</h3>
        <Group title="Live sources" sub="Fetched fresh on every question" items={live} />
        <Group title="Embedded library" sub="An ingested corpus searched alongside the live pull" items={library} />
        <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
          News and community chatter are kept in a separate panel and are <b>never</b> cited as evidence. Answers are graded on the sources above.
        </p>
        <div className="confirm-actions" style={{ marginTop: 12 }}>
          <button type="button" className="confirm-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, sub, items }: { title: string; sub: string; items: DataSource[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="menu-label">{title}</div>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>{sub}</p>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span className="watch-card-dot active" aria-hidden style={{ marginTop: 5 }} />
            <span>
              <b style={{ fontSize: 13 }}>{s.name}</b>
              {s.badge === "safety" ? <small style={{ color: "var(--text-3)", marginLeft: 6 }}>safety</small> : null}
              {s.badge === "conditional" ? <small style={{ color: "var(--text-3)", marginLeft: 6 }}>as needed</small> : null}
              <br />
              <small style={{ color: "var(--text-2)", fontSize: 12 }}>{s.desc}</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
