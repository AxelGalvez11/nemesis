"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { WatchEvent } from "@pharmabro/shared";
import { deleteWatch, fetchWatch, fetchWatchEvents, setWatchStatus, type WatchSummary } from "@/lib/api";
import { WatchDetail } from "@/components/WatchDetail";
import { Icon } from "@/components/icons";

// One watch, opened from the Monitoring section. Loads the watch (for the header) + its events (the
// three channels) and hands them to WatchDetail — the same renderer the static-mock was verified
// against. The header carries the manage controls: pause/resume (the scheduler only checks active
// watches) and delete (inline two-step confirm; cascades to the watch's events).
export default function WatchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const [watch, setWatch] = useState<WatchSummary | null>(null);
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); // a pause/delete is in flight
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  // Pause (the scheduler skips paused watches) or resume. Optimistic — flip the local status, revert on failure.
  async function togglePause() {
    if (!watch || busy) return;
    const next = watch.status === "paused" ? "active" : "paused";
    setBusy(true);
    setWatch({ ...watch, status: next });
    try {
      await setWatchStatus(watch.id, next);
    } catch (e) {
      setWatch({ ...watch, status: watch.status }); // revert
      setErr(e instanceof Error ? e.message : "Could not update this watch.");
    } finally {
      setBusy(false);
    }
  }

  // Delete the watch (cascades to its events), then return to the list.
  async function doDelete() {
    if (!watch || busy) return;
    setBusy(true);
    try {
      await deleteWatch(watch.id);
      router.push("/app/monitor");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete this watch.");
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="research-wrap">
      <div className="research-head">
        <Link className="chip-action" href="/app/monitor">← All watches</Link>
        {watch ? (
          <div className="watch-actions">
            <button type="button" className="chip-action" onClick={() => void togglePause()} disabled={busy}>
              {watch.status === "paused" ? "Resume" : "Pause"}
            </button>
            {confirmingDelete ? (
              <>
                <span className="watch-confirm-label">Delete this watch?</span>
                <button type="button" className="chip-action" onClick={() => setConfirmingDelete(false)} disabled={busy}>Cancel</button>
                <button type="button" className="chip-action watch-delete-confirm" onClick={() => void doDelete()} disabled={busy}>Delete</button>
              </>
            ) : (
              <button type="button" className="chip-action watch-delete" onClick={() => setConfirmingDelete(true)} disabled={busy}>
                <Icon name="trash" size={14} /> Delete
              </button>
            )}
          </div>
        ) : null}
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
