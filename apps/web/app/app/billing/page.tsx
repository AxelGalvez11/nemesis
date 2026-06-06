"use client";

import { useEffect, useState } from "react";
import type { EntitlementSnapshot } from "@pharmabro/shared";
import { useAuth } from "@/components/AuthProvider";
import { Card, ErrorText, PageHeader, Badge } from "@/components/ui";
import { fetchEntitlements } from "@/lib/api";

export default function BillingPage() {
  const { session } = useAuth();
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetchEntitlements().then(setEnt).catch((e) => setError(e instanceof Error ? e.message : "Billing failed"));
  }, []);

  async function post(path: string) {
    setBusy(path);
    setError(null);
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Sign in first");
      const res = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.message || body.error || "Stripe request failed");
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stripe request failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Billing" eyebrow="Stripe Plus">
        Upgrade to Plus for 100 cited questions per day and 50 watchlist follows.
      </PageHeader>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <div className="grid two">
        <Card>
          <div className="row">
            <h2>Current plan</h2>
            <Badge>{ent?.plan ?? "free"}</Badge>
          </div>
          <p className="muted">Plan updates are mirrored from Stripe webhooks into Supabase subscriptions.</p>
          <button disabled={busy === "/api/stripe/portal"} onClick={() => void post("/api/stripe/portal")}>
            {busy === "/api/stripe/portal" ? "Opening…" : "Manage billing"}
          </button>
        </Card>
        <Card>
          <h2>PharmaOrb Plus</h2>
          <p><strong>$12/month</strong></p>
          <ul>
            <li>100 Ask questions per day</li>
            <li>50 watchlist follows</li>
            <li>Plus monitoring surfaces as they roll out</li>
          </ul>
          <button disabled={busy === "/api/stripe/checkout"} onClick={() => void post("/api/stripe/checkout")}>
            {busy === "/api/stripe/checkout" ? "Opening checkout…" : "Upgrade to Plus"}
          </button>
        </Card>
      </div>
    </>
  );
}
