"use client";

import { useEffect, useState } from "react";
import type { EntitlementSnapshot } from "@pharmabro/shared";
import { useAuth } from "@/components/AuthProvider";
import { Card, ErrorText, Badge } from "@/components/ui";
import { fetchEntitlements } from "@/lib/api";
import { phCapture } from "@/lib/posthog";

/**
 * Billing content (current plan + Plus/Pro upgrade cards), with NO page header — the host supplies the
 * heading. Stripe checkout/portal redirect via window.location, so this works identically whether it is
 * rendered on /app/billing (full page) or in the account-menu Billing overlay.
 */
export function BillingPanel() {
  const { session } = useAuth();
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetchEntitlements().then(setEnt).catch((e) => setError(e instanceof Error ? e.message : "Billing failed"));
  }, []);

  async function post(action: string, path: string, payload?: Record<string, unknown>) {
    setBusy(action);
    setError(null);
    if (payload?.plan) phCapture("checkout_started", { plan: payload.plan });
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Sign in first");
      const res = await fetch(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      });
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
      {error ? <ErrorText>{error}</ErrorText> : null}
      <div className="grid two">
        <Card>
          <div className="row">
            <h2>Current plan</h2>
            <Badge>{ent?.plan ?? "free"}</Badge>
          </div>
          <p className="muted">Plan updates are mirrored from Stripe webhooks into Supabase subscriptions.</p>
          <button disabled={busy === "portal"} onClick={() => void post("portal", "/api/stripe/portal")}>
            {busy === "portal" ? "Opening…" : "Manage billing"}
          </button>
        </Card>
        <Card>
          <h2>PharmaOrb Plus</h2>
          <p><strong>$20/month</strong></p>
          <ul>
            <li>100 Ask questions per day</li>
            <li>50 watchlist follows</li>
            <li>Plus monitoring surfaces as they roll out</li>
          </ul>
          <button disabled={busy === "plus"} onClick={() => void post("plus", "/api/stripe/checkout", { plan: "plus" })}>
            {busy === "plus" ? "Opening checkout…" : "Upgrade to Plus"}
          </button>
        </Card>
        <Card>
          <h2>PharmaOrb Pro</h2>
          <p><strong>$49/month</strong></p>
          <ul>
            <li>Everything in Plus, plus:</li>
            <li><strong>Deep Research</strong> — 3 multi-step cited reports per day</li>
            <li>250 Ask questions per day · 100 watchlist follows</li>
            <li>Literature review &amp; meta-analysis as they roll out</li>
          </ul>
          <button disabled={busy === "pro"} onClick={() => void post("pro", "/api/stripe/checkout", { plan: "pro" })}>
            {busy === "pro" ? "Opening checkout…" : "Upgrade to Pro"}
          </button>
        </Card>
      </div>
    </>
  );
}
