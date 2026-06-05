"use client";

import { useEffect, useState } from "react";
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
    await unfollowItem(id);
    await load();
  }

  const limit = Number(ent?.entitlements.watchlist_limit ?? 3);

  return (
    <>
      <PageHeader title="Watchlist" eyebrow="Monitoring">
        Follow drugs and topics, then review source-backed updates and weekly digest snapshots.
      </PageHeader>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <div className="grid two">
        <Card>
          <div className="row">
            <h2>Follows</h2>
            <Badge>{items.length}/{limit}</Badge>
          </div>
          {items.length ? (
            <ul className="list">
              {items.map((item) => (
                <li className="row" key={item.id}>
                  <span>{item.item_type}: {item.item_ref}</span>
                  <button className="secondary" onClick={() => void onUnfollow(item.id)}>Unfollow</button>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No follows yet. Search a drug and tap Follow.</p>}
        </Card>
        <Card>
          <h2>Weekly digest</h2>
          {digest ? (
            <>
              <p><strong>{digest.update_count}</strong> updates from {digest.period_start} to {digest.period_end}</p>
              <p className="muted">Generated {digest.generated_at}</p>
            </>
          ) : <p className="muted">No digest generated yet.</p>}
        </Card>
      </div>
      <section className="answer-section">
        <h2>Matched updates</h2>
        <div className="grid">
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
