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

// Tier ordering, so a card knows whether it's the user's current plan, an upgrade, or already included
// in a higher plan they hold. Unknown/legacy plan names fall back to 0 (treated as the base tier).
const PLAN_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2, max: 3 };
const rankOf = (plan?: string | null): number => PLAN_RANK[(plan ?? "free").toLowerCase()] ?? 0;

/**
 * Billing content (current plan + Student/Agent Pro/Max cards), with NO page header — the host supplies the heading.
 * Plan-aware: each card reflects whether it's your current tier, an upgrade, or already included. Stripe
 * checkout/portal redirect via window.location. After a successful checkout the plan is written by an
 * async Stripe webhook (a few seconds behind the redirect), so when `checkoutStatus === "success"` we
 * re-read entitlements a few times and show an "applying…" note instead of a stale tier.
 */
export function BillingPanel({ checkoutStatus }: { checkoutStatus?: string }) {
  const { session } = useAuth();
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [applying, setApplying] = useState(checkoutStatus === "success");

  useEffect(() => {
    void fetchEntitlements().then(setEnt).catch((e) => setError(e instanceof Error ? e.message : "Billing failed"));
  }, []);

  // Post-checkout: the plan-update webhook lands a moment after the redirect. Re-read a few times so the
  // new tier appears without a manual reload; clear the "applying" note once a paid plan shows or we time out.
  useEffect(() => {
    if (checkoutStatus !== "success") return;
    let cancelled = false;
    const delays = [1500, 3000, 5000, 8000];
    const timers = delays.map((d, i) =>
      setTimeout(() => {
        void fetchEntitlements()
          .then((e) => {
            if (cancelled) return;
            setEnt(e);
            if (rankOf(e.plan) > 0) setApplying(false);
          })
          .catch(() => {});
        if (i === delays.length - 1 && !cancelled) setApplying(false);
      }, d),
    );
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [checkoutStatus]);

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

  const currentRank = rankOf(ent?.plan);

  // The per-plan call to action: current tier → disabled "Current plan"; a tier below the one you hold →
  // "Included in your plan" (no re-purchase / mislabeled downgrade); a higher tier → a real upgrade button.
  function planCta(tier: "plus" | "pro" | "max", label: string) {
    const tierRank = rankOf(tier);
    if (ent && currentRank === tierRank) {
      return <button style={{ width: "100%" }} className="secondary" disabled>✓ Current plan</button>;
    }
    if (ent && currentRank > tierRank) {
      return <button style={{ width: "100%" }} className="secondary" disabled>Included in your plan</button>;
    }
    return (
      <button style={{ width: "100%" }} disabled={busy === tier} onClick={() => void post(tier, "/api/stripe/checkout", { plan: tier })}>
        {busy === tier ? "Opening checkout…" : label}
      </button>
    );
  }

  const isPlus = ent != null && currentRank === rankOf("plus");
  const isPro = ent != null && currentRank === rankOf("pro");
  const isMax = ent != null && currentRank === rankOf("max");

  return (
    <>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {checkoutStatus === "success" ? (
        <p className="success-text" style={{ margin: 0 }}>
          {applying ? "Payment received — applying your new plan… (this can take a few seconds)" : "Your plan is up to date."}
        </p>
      ) : checkoutStatus === "cancelled" ? (
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Checkout cancelled — no changes were made.</p>
      ) : null}
      <Card>
        <div className="row" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>Current plan</h2>
          <Badge>{ent?.plan ?? "free"}</Badge>
        </div>
        <p className="muted" style={{ margin: "0 0 14px" }}>Manage, change, or cancel your subscription through Stripe.</p>
        <button className="secondary" disabled={busy === "portal"} onClick={() => void post("portal", "/api/stripe/portal")}>
          {busy === "portal" ? "Opening…" : "Manage billing"}
        </button>
      </Card>
      <div className="grid three">
        <Card className={isPlus ? "acid" : ""}>
          <div className="row" style={{ marginBottom: 2 }}>
            <h2 style={{ margin: "0 0 2px" }}>Nemesis Student</h2>
            {isPlus ? <span className="badge" style={{ borderColor: "var(--line-acid)", color: "var(--acid-deep)" }}>Current</span> : null}
          </div>
          <p style={{ margin: "0 0 12px" }}>
            <strong style={{ fontSize: 22, letterSpacing: "-0.02em" }}>$9.99</strong>
            <span className="muted" style={{ fontSize: 13 }}> / month</span>
          </p>
          <ul style={billingList}>
            <li style={billingItem}><span style={billingTick}>✓</span>Higher daily limits for answers, notes &amp; decks</li>
            <li style={billingItem}><span style={billingTick}>✓</span>Turn your lectures into notes + exam-ready flashcards</li>
            <li style={billingItem}><span style={billingTick}>✓</span>Sync your school portal + email on a schedule</li>
          </ul>
          {planCta("plus", "Upgrade to Student")}
        </Card>
        <Card className="acid">
          <div className="row" style={{ marginBottom: 2 }}>
            <h2 style={{ margin: 0 }}>Nemesis Agent Pro</h2>
            {isPro || currentRank < rankOf("pro") ? (
              <span className="badge" style={{ borderColor: "var(--line-acid)", color: "var(--acid-deep)" }}>{isPro ? "Current" : "Recommended"}</span>
            ) : null}
          </div>
          <p style={{ margin: "0 0 12px" }}>
            <strong style={{ fontSize: 22, letterSpacing: "-0.02em" }}>$19.99</strong>
            <span className="muted" style={{ fontSize: 13 }}> / month</span>
          </p>
          <ul style={billingList}>
            <li style={{ ...billingItem, color: "var(--text-2)", fontWeight: 600, fontSize: 12.5 }}>Everything in Student, plus:</li>
            <li style={billingItem}><span style={billingTick}>✓</span>The agent runs your whole semester end-to-end</li>
            <li style={billingItem}><span style={billingTick}>✓</span><span><strong>Deep research</strong> reports with real citations</span></li>
            <li style={billingItem}><span style={billingTick}>✓</span>Live lecture copilot — up to 2 lectures a day</li>
          </ul>
          {planCta("pro", "Upgrade to Agent Pro")}
        </Card>
        <Card className={isMax ? "acid" : ""}>
          <div className="row" style={{ marginBottom: 2 }}>
            <h2 style={{ margin: 0 }}>Nemesis Max</h2>
            {isMax ? <span className="badge" style={{ borderColor: "var(--line-acid)", color: "var(--acid-deep)" }}>Current</span> : null}
          </div>
          <p style={{ margin: "0 0 12px" }}>
            <strong style={{ fontSize: 22, letterSpacing: "-0.02em" }}>$49.99</strong>
            <span className="muted" style={{ fontSize: 13 }}> / month</span>
          </p>
          <ul style={billingList}>
            <li style={{ ...billingItem, color: "var(--text-2)", fontWeight: 600, fontSize: 12.5 }}>Everything in Agent Pro, with no ceiling:</li>
            <li style={billingItem}><span style={billingTick}>✓</span>Unlimited live lecture copilot — real-time, every class</li>
            <li style={billingItem}><span style={billingTick}>✓</span>The highest daily limits on everything</li>
            <li style={billingItem}><span style={billingTick}>✓</span>First access to every new power we ship</li>
          </ul>
          {planCta("max", "Upgrade to Max")}
        </Card>
      </div>
    </>
  );
}
