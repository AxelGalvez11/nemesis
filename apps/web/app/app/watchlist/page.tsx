"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Digest, EntitlementSnapshot, WatchlistItem, WatchlistUpdate } from "@pharmabro/shared";
import { fetchEntitlements, fetchLatestDigest, fetchWatchlist, fetchWatchlistUpdates, unfollowItem } from "@/lib/api";
import { Badge, Card, ErrorText, PageHeader, SourceAnchor } from "@/components/ui";

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [updates, setUpdates] = useState<WatchlistUpdate[]>([]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [w, u, d, e] = await Promise.all([
      fetchWatchlist(),
      fetchWatchlistUpdates(),
      fetchLatestDigest(),
      fetchEntitlements(),
    ]);
    setItems(w);
    setUpdates(u);
    setDigest(d);
    setEnt(e);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Watchlist failed"));
  }, []);

  async function onUnfollow(id: string) {
    try {
      await unfollowItem(id);
      await load();
      toast.success("Removed from watchlist.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove from watchlist");
    }
  }

  const plan = ent?.plan ?? "free";
  const limit = Number(ent?.entitlements.watchlist_limit ?? 3);

  return (
    <>
      <PageHeader title="Watchlist" eyebrow="Monitoring">
        Follow drugs and topics, then review source-backed updates and weekly digest snapshots.
      </PageHeader>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <section className="plan-bar">
        <div>
          <strong>{plan} plan · {items.length} / {limit} follows used</strong>
          <p className="muted">{plan === "plus" ? "Plus includes 50 follows and 100 Ask questions per day." : "Upgrade to Plus for 50 follows and higher Ask limits."}</p>
        </div>
        <Link className="button-link" href="/app/billing">{plan === "plus" ? "Manage billing" : "Upgrade to Plus"}</Link>
      </section>

      <div className="grid two">
        <section>
          <div className="eyebrow">Following ({items.length})</div>
          <div className="updates-list">
            {items.length ? items.map((item) => (
              <div className="watch-row" key={item.id}>
                <span className="watch-dot" style={{ background: item.item_type === "drug" ? "#1a8c5c" : "#0278c0" }} />
                <div style={{ flex: 1 }}>
                  <strong>{item.item_ref}</strong>
                  <p className="muted">{item.item_type} · {item.frequency}</p>
                </div>
                <button className="secondary" onClick={() => void onUnfollow(item.id)}>Unfollow</button>
              </div>
            )) : (
              <Card>
                <h2>No follows yet</h2>
                <p className="muted">Search a drug and tap Follow to start monitoring updates.</p>
              </Card>
            )}
          </div>
        </section>

        <section>
          <div className="eyebrow">Weekly digest</div>
          <Card className="acid">
            {digest ? (
              <>
                <h2>{digest.update_count} updates</h2>
                <p>From {digest.period_start} to {digest.period_end}</p>
                <p className="muted">Generated {digest.generated_at}</p>
              </>
            ) : <p className="muted">No digest generated yet.</p>}
          </Card>
        </section>
      </div>
      <section className="answer-section">
        <div className="eyebrow">What&apos;s new</div>
        <div className="updates-list">
          {updates.length ? updates.map((u) => (
            <Card key={u.id}>
              <div className="row">
                <h3>{u.title}</h3>
                <Badge>{u.update_type}</Badge>
              </div>
              <p className="muted">{u.summary}</p>
              <SourceAnchor sourceId={u.source_id} label="Open source" />
            </Card>
          )) : <p className="muted">No matched updates yet.</p>}
        </div>
      </section>
    </>
  );
}
