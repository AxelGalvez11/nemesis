"use client";

import { useEffect, useState } from "react";
import type { EntitlementSnapshot } from "@nemesis/shared";
import { useAuth } from "@/components/AuthProvider";
import { Card, ErrorText, Badge } from "@/components/ui";
import { fetchEntitlements } from "@/lib/api";
import { phCapture } from "@/lib/posthog";
import { planLabel } from "@/lib/billing-contract";

const billingList: React.CSSProperties = { listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 9 };
const billingItem: React.CSSProperties = { display: "flex", gap: 8, fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.45 };
const billingTick: React.CSSProperties = { color: "var(--acid)", flex: "0 0 auto", fontWeight: 700, lineHeight: 1.45 };

// Tier ordering, so a card knows whether it's the user's current plan, an upgrade, or already included
// in a higher plan they hold. Unknown/legacy plan names fall back to 0 (treated as the base tier).
const PLAN_RANK: Record<string, number> = {
  free: 0,
  plus: 1,
  student: 1,
  pro: 2,
  professional: 3,
  max: 4,
  enterprise: 4,
};
const rankOf = (plan?: string | null): number => PLAN_RANK[(plan ?? "free").toLowerCase()] ?? 0;

interface CatalogPrice {
  unitAmount: number | null;
  currency: string;
  interval: string | null;
}

interface BillingCatalog {
  plus: CatalogPrice;
  pro: CatalogPrice;
  max?: CatalogPrice;
}

function formatPrice(price: CatalogPrice | undefined): { amount: string; interval: string } {
  if (!price || price.unitAmount == null) return { amount: "Price in checkout", interval: "" };
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: price.unitAmount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price.unitAmount / 100);
  return { amount, interval: price.interval ? ` / ${price.interval}` : "" };
}

// Freemium (2026-07-20): checkout never grants a trial, so the disclosure only
// ever describes an immediate recurring subscription.
function checkoutDisclosure(price: { amount: string; interval: string }): string {
  if (price.amount === "Price in checkout") {
    return "Card required. Stripe shows the recurring price before you subscribe. Cancel anytime in Stripe.";
  }
  return `Card required. Your ${price.amount}${price.interval} recurring subscription starts when you confirm in Stripe. Cancel anytime.`;
}

/**
 * Billing content (current plan + Plus/Pro cards), with NO page header — the host supplies the heading.
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
  const [catalog, setCatalog] = useState<BillingCatalog | null>(null);

  useEffect(() => {
    void fetchEntitlements().then(setEnt).catch((e) => setError(e instanceof Error ? e.message : "Billing failed"));
  }, []);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    void fetch("/api/stripe/catalog", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load subscription prices");
        return res.json() as Promise<{ plans: BillingCatalog }>;
      })
      .then((body) => {
        if (cancelled) return;
        setCatalog(body.plans);
      })
      .catch(() => {
        // Checkout remains authoritative if Stripe's catalog cannot be read momentarily.
      });
    return () => { cancelled = true; };
  }, [session?.access_token]);

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
    if (ent && currentRank > 0) {
      return (
        <button style={{ width: "100%" }} disabled={busy === "portal"} onClick={() => void post("portal", "/api/stripe/portal")}>
          {busy === "portal" ? "Opening billing…" : "Change plan in billing"}
        </button>
      );
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
  const plusPrice = formatPrice(catalog?.plus);
  const proPrice = formatPrice(catalog?.pro);
  const maxPrice = formatPrice(catalog?.max);

  return (
    <>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {checkoutStatus === "success" ? (
        <p className="success-text" style={{ margin: 0 }}>
          {applying ? "Checkout complete — applying your new plan… (this can take a few seconds)" : "Your plan is up to date."}
        </p>
      ) : checkoutStatus === "cancelled" ? (
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Checkout cancelled — no changes were made.</p>
      ) : null}
      <Card>
        <div className="row" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>Current plan</h2>
          <Badge>{ent ? planLabel(ent.plan) : "checking…"}</Badge>
        </div>
        <p className="muted" style={{ margin: "0 0 14px" }}>
          {!ent
            ? "Checking subscription status…"
            : currentRank > 0
            ? "Manage, change, or cancel your subscription through Stripe."
            : "Choose a plan below. Stripe shows the recurring total before you subscribe."}
        </p>
        <button className="secondary" disabled={busy === "portal"} onClick={() => void post("portal", "/api/stripe/portal")}>
          {busy === "portal" ? "Opening…" : "Manage billing"}
        </button>
      </Card>
      <div className="grid two">
        <Card className={isPlus ? "acid" : ""}>
          <div className="row" style={{ marginBottom: 2 }}>
            <h2 style={{ margin: "0 0 2px" }}>Nemesis Student</h2>
            {isPlus ? <span className="badge" style={{ borderColor: "var(--line-success)", color: "var(--success)" }}>Current</span> : null}
          </div>
          <p style={{ margin: "0 0 12px" }}>
            <strong style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{plusPrice.amount}</strong>
            <span className="muted" style={{ fontSize: 13 }}>{plusPrice.interval}</span>
          </p>
          <ul style={billingList}>
            <li style={billingItem}><span style={billingTick}>✓</span>Higher limits for answers, notes, and study decks</li>
            <li style={billingItem}><span style={billingTick}>✓</span>Turn lectures into organized study material</li>
            {/* Recording hours mirror plan_entitlements.transcription_seconds_month_limit,
                app/pricing/page.tsx and workspace/shell/billing-settings.tsx. Four copies
                of one number; they had drifted apart by more than 3x by 2026-07-28. */}
            <li style={billingItem}><span style={billingTick}>✓</span>20 hours of lecture recording each month</li>
            <li style={billingItem}><span style={billingTick}>✓</span>A calendar built from your syllabus</li>
          </ul>
          {planCta("plus", "Upgrade to Student")}
          {currentRank === 0 ? (
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: "12px 0 0" }}>
              {checkoutDisclosure(plusPrice)}
            </p>
          ) : null}
        </Card>
        <Card className="acid">
          <div className="row" style={{ marginBottom: 2 }}>
            <h2 style={{ margin: 0 }}>Nemesis Agent Pro</h2>
            <span className="badge" style={{ borderColor: "var(--line-success)", color: "var(--success)" }}>{isPro ? "Current" : "Recommended"}</span>
          </div>
          <p style={{ margin: "0 0 12px" }}>
            <strong style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{proPrice.amount}</strong>
            <span className="muted" style={{ fontSize: 13 }}>{proPrice.interval}</span>
          </p>
          <ul style={billingList}>
            <li style={{ ...billingItem, color: "var(--text-2)", fontWeight: 600, fontSize: 12.5 }}>Everything in Student, plus:</li>
            <li style={billingItem}><span style={billingTick}>✓</span><span><strong>Web-grounded answers</strong> with source citations</span></li>
            <li style={billingItem}><span style={billingTick}>✓</span>Higher desktop-agent automation limits</li>
            <li style={billingItem}><span style={billingTick}>✓</span>70 hours of lecture recording each month</li>
          </ul>
          {planCta("pro", "Upgrade to Agent Pro")}
          {currentRank === 0 ? (
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: "12px 0 0" }}>
              {checkoutDisclosure(proPrice)}
            </p>
          ) : null}
        </Card>
        {catalog?.max ? (
          <Card className={isMax ? "acid" : ""}>
            <div className="row" style={{ marginBottom: 2 }}>
              <h2 style={{ margin: 0 }}>Nemesis Max</h2>
              {isMax ? <span className="badge" style={{ borderColor: "var(--line-success)", color: "var(--success)" }}>Current</span> : null}
            </div>
            <p style={{ margin: "0 0 12px" }}>
              <strong style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{maxPrice.amount}</strong>
              <span className="muted" style={{ fontSize: 13 }}>{maxPrice.interval}</span>
            </p>
            <ul style={billingList}>
              <li style={{ ...billingItem, color: "var(--text-2)", fontWeight: 600, fontSize: 12.5 }}>Everything in Agent Pro, five times over:</li>
              <li style={billingItem}><span style={billingTick}>✓</span>Highest usage limits across the agent</li>
              <li style={billingItem}><span style={billingTick}>✓</span>200 hours of lecture recording each month</li>
              <li style={billingItem}><span style={billingTick}>✓</span>First access to new capabilities</li>
            </ul>
            {planCta("max", "Upgrade to Max")}
            {currentRank === 0 ? (
              <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: "12px 0 0" }}>
                {checkoutDisclosure(maxPrice)}
              </p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}
