"use client";

import { useEffect, useState } from "react";
import type { EntitlementSnapshot } from "@pharmabro/shared";
import { useAuth } from "@/components/AuthProvider";
import { Card, ErrorText, Badge } from "@/components/ui";
import { fetchEntitlements } from "@/lib/api";
import { phCapture } from "@/lib/posthog";

const billingList: React.CSSProperties = { listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 9 };
const billingItem: React.CSSProperties = { display: "flex", gap: 8, fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.45 };
const billingTick: React.CSSProperties = { color: "var(--acid)", flex: "0 0 auto", fontWeight: 700, lineHeight: 1.45 };

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
      <Card>
        <div className="row" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>Current plan</h2>
          <Badge>{ent?.plan ?? "free"}</Badge>
        </div>
        <p className="muted" style={{ margin: "0 0 14px" }}>Plan updates are mirrored from Stripe webhooks into Supabase subscriptions.</p>
        <button className="secondary" disabled={busy === "portal"} onClick={() => void post("portal", "/api/stripe/portal")}>
          {busy === "portal" ? "Opening…" : "Manage billing"}
        </button>
      </Card>
      <div className="grid two">
        <Card>
          <h2 style={{ margin: "0 0 2px" }}>PharmaOrb Plus</h2>
          <p style={{ margin: "0 0 12px" }}>
            <strong style={{ fontSize: 22, letterSpacing: "-0.02em" }}>$20</strong>
            <span className="muted" style={{ fontSize: 13 }}> / month</span>
          </p>
          <ul style={billingList}>
            <li style={billingItem}><span style={billingTick}>✓</span>100 Ask questions per day</li>
            <li style={billingItem}><span style={billingTick}>✓</span>50 watchlist follows</li>
            <li style={billingItem}><span style={billingTick}>✓</span>Plus monitoring surfaces as they roll out</li>
          </ul>
          <button style={{ width: "100%" }} disabled={busy === "plus"} onClick={() => void post("plus", "/api/stripe/checkout", { plan: "plus" })}>
            {busy === "plus" ? "Opening checkout…" : "Upgrade to Plus"}
          </button>
        </Card>
        <Card className="acid">
          <div className="row" style={{ marginBottom: 2 }}>
            <h2 style={{ margin: 0 }}>PharmaOrb Pro</h2>
            <span className="badge" style={{ borderColor: "var(--line-acid)", color: "var(--acid-deep)" }}>Recommended</span>
          </div>
          <p style={{ margin: "0 0 12px" }}>
            <strong style={{ fontSize: 22, letterSpacing: "-0.02em" }}>$49</strong>
            <span className="muted" style={{ fontSize: 13 }}> / month</span>
          </p>
          <ul style={billingList}>
            <li style={{ ...billingItem, color: "var(--text-2)", fontWeight: 600, fontSize: 12.5 }}>Everything in Plus, plus:</li>
            <li style={billingItem}><span style={billingTick}>✓</span><span><strong>Deep Research</strong> — 3 multi-step cited reports per day</span></li>
            <li style={billingItem}><span style={billingTick}>✓</span>250 Ask questions per day · 100 watchlist follows</li>
            <li style={billingItem}><span style={billingTick}>✓</span>Literature review &amp; meta-analysis as they roll out</li>
          </ul>
          <button style={{ width: "100%" }} disabled={busy === "pro"} onClick={() => void post("pro", "/api/stripe/checkout", { plan: "pro" })}>
            {busy === "pro" ? "Opening checkout…" : "Upgrade to Pro"}
          </button>
        </Card>
      </div>
    </>
  );
}
