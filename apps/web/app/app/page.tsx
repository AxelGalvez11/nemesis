"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EntitlementSnapshot, UsageSnapshot } from "@pharmabro/shared";
import { Card, PageHeader, Badge } from "@/components/ui";
import { fetchEntitlements, fetchUsage } from "@/lib/api";

export default function AppHome() {
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);

  useEffect(() => {
    void Promise.all([fetchEntitlements(), fetchUsage()]).then(([e, u]) => {
      setEnt(e);
      setUsage(u);
    });
  }, []);

  const ask = usage?.counters.ask_daily;
  const watchLimit = ent?.entitlements.watchlist_limit ?? 3;

  return (
    <>
      <PageHeader title="Evidence workspace" eyebrow="Public beta">
        Ask cited questions, inspect the source trail, and follow evidence updates.
      </PageHeader>
      <div className="grid three">
        <Card>
          <Badge>{ent?.plan ?? "free"}</Badge>
          <h2>Plan</h2>
          <p className="muted">Free and Plus are enforced server-side. Client prompts are just the front door.</p>
          <Link className="source-link" href="/app/billing">Manage billing</Link>
        </Card>
        <Card>
          <h2>Ask usage</h2>
          <p><strong>{ask?.used ?? 0}</strong> / {ask?.limit ?? 10} questions today</p>
          <Link className="source-link" href="/app/ask">Ask a question</Link>
        </Card>
        <Card>
          <h2>Watchlist</h2>
          <p>Follow up to <strong>{watchLimit}</strong> items on your current plan.</p>
          <Link className="source-link" href="/app/explore">Find an item</Link>
        </Card>
      </div>
    </>
  );
}
