"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { WatchEvent } from "@pharmabro/shared";
import { fetchWatch, fetchWatchEvents, type WatchSummary } from "@/lib/api";
import { WatchDetail } from "@/components/WatchDetail";

// One watch, opened from the Monitoring section. Loads the watch (for the header) + its events (the
// three channels) and hands them to WatchDetail — the same renderer the static-mock was verified
// against. Pre-deploy the fetches return null/[] gracefully (the tables don't exist yet).
export default function WatchDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const [watch, setWatch] = useState<WatchSummary | null>(null);
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setErr(null);
    Promise.all([fetchWatch(id), fetchWatchEvents(id)])
      .then(([w, evs]) => {
        if (!alive) return;
        if (w) { setWatch(w); setEvents(evs); } else setErr("Watch not found.");
      })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load this watch."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  return (
    <div className="research-wrap">
      <div className="research-head">
        <Link className="chip-action" href="/app/monitor">← All watches</Link>
      </div>
      {loading ? <p className="muted" style={{ fontSize: 14 }}>Loading…</p> : null}
      {err ? <p className="tmpl-note">{err}</p> : null}
      {watch ? (
        <WatchDetail
          watch={{ title: watch.title, cadence: watch.cadence, baselined: watch.baselined_at !== null }}
          events={events}
        />
      ) : null}
    </div>
  );
}
