"use client";

import { useEffect, useState } from "react";
import type { EntitlementSnapshot, UsageSnapshot } from "@pharmabro/shared";
import { useAuth } from "@/components/AuthProvider";
import { Badge, Card, PageHeader } from "@/components/ui";
import { fetchEntitlements, fetchUsage } from "@/lib/api";

export default function ProfilePage() {
  const { session } = useAuth();
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);

  useEffect(() => {
    void Promise.all([fetchEntitlements(), fetchUsage()]).then(([e, u]) => {
      setEnt(e);
      setUsage(u);
    });
  }, []);

  const ask = usage?.counters.ask_daily;

  return (
    <>
      <PageHeader title="Profile" eyebrow="Account">
        Your signed-in beta account and current entitlement snapshot.
      </PageHeader>
      <div className="grid two">
        <Card>
          <h2>Account</h2>
          <p>{session?.user.email}</p>
          <p className="muted">Educational information only. Not medical advice.</p>
        </Card>
        <Card>
          <div className="row">
            <h2>Plan</h2>
            <Badge>{ent?.plan ?? "free"}</Badge>
          </div>
          <p>Ask today: {ask?.used ?? 0}/{ask?.limit ?? 10}</p>
          <p>Watchlist limit: {String(ent?.entitlements.watchlist_limit ?? 3)}</p>
        </Card>
      </div>
    </>
  );
}
