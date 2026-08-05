"use client";

// Settings → Billing, in the workspace design language (owner 2026-07-20
// evening: "beautify the billing page in the settings pop up"). Same data
// flow as the standalone /account/billing panel — entitlements RPC, Stripe
// catalog for live prices, checkout/portal redirects — but rendered with
// desktop-ui cards instead of the old landing-page styles.

import { useEffect, useState } from "react";

import type { EntitlementSnapshot } from "@nemesis/shared";
import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { useAuth } from "@/components/AuthProvider";
import { fetchEntitlements } from "@/lib/api";
import { planLabel } from "@/lib/billing-contract";
import { phCapture } from "@/lib/posthog";
import { cn } from "@/lib/utils";

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

interface PlanCardSpec {
  tier: "plus" | "pro" | "max";
  name: string;
  tagline: string;
  cta: string;
  features: string[];
  recommended?: boolean;
}

// Recording hours must match plan_entitlements.transcription_seconds_month_limit and
// the same lines on app/pricing/page.tsx — three copies of one number, and they had
// already drifted apart by more than 3x. "Live copilot" was also stale: there is no
// live lane, a recording is written up once after it stops.
const PLAN_CARDS: PlanCardSpec[] = [
  {
    tier: "plus",
    name: "Student",
    tagline: "Everyday studying, upgraded.",
    cta: "Upgrade to Student",
    features: [
      "Higher limits for answers, notes, and study decks",
      "Turn lectures into organized study material",
      "30 hours of lecture recording each month",
      "A calendar built from your syllabus",
    ],
  },
  {
    tier: "pro",
    name: "Agent Pro",
    tagline: "Everything in Student, plus:",
    cta: "Upgrade to Agent Pro",
    recommended: true,
    features: [
      "Web-grounded answers with source citations",
      "Higher desktop-agent automation limits",
      "70 hours of lecture recording each month",
    ],
  },
  {
    tier: "max",
    name: "Max",
    tagline: "Everything in Agent Pro, five times over:",
    cta: "Upgrade to Max",
    features: [
      "Highest usage limits across the agent",
      "200 hours of lecture recording each month",
      "First access to new capabilities",
    ],
  },
];

export function BillingSettings() {
  const { session } = useAuth();
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot | null>(null);
  const [catalog, setCatalog] = useState<BillingCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetchEntitlements()
      .then(setSnapshot)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Couldn't check your plan."));
  }, []);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    void fetch("/api/stripe/catalog", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("catalog unavailable");
        return res.json() as Promise<{ plans: BillingCatalog }>;
      })
      .then((body) => {
        if (!cancelled) setCatalog(body.plans);
      })
      .catch(() => {
        // Checkout stays authoritative when the price catalog can't be read.
      });
    return () => { cancelled = true; };
  }, [session?.access_token]);

  async function post(action: string, path: string, payload?: Record<string, unknown>) {
    setBusy(action);
    setError(null);
    if (payload?.plan) phCapture("checkout_started", { plan: payload.plan });
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Sign in first.");
      const res = await fetch(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.message || body.error || "Stripe request failed.");
      window.location.href = body.url;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Stripe request failed.");
    } finally {
      setBusy(null);
    }
  }

  const currentRank = rankOf(snapshot?.plan);
  const prices: Record<PlanCardSpec["tier"], { amount: string; interval: string }> = {
    plus: formatPrice(catalog?.plus),
    pro: formatPrice(catalog?.pro),
    max: formatPrice(catalog?.max),
  };
  const visibleCards = PLAN_CARDS.filter((card) => card.tier !== "max" || Boolean(catalog?.max));

  return (
    <div className="grid gap-4">
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-base)_4%,var(--background))] p-5">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">Current plan</p>
          <p className="mt-1 text-xl font-semibold">{snapshot ? planLabel(snapshot.plan) : "Checking…"}</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-(--ui-text-tertiary)">
            {!snapshot
              ? "Checking subscription status…"
              : currentRank > 0
                ? "Manage, change, or cancel your subscription through Stripe."
                : "Pick a plan below — Stripe shows the recurring total before you subscribe."}
          </p>
        </div>
        <Button disabled={busy === "portal"} onClick={() => void post("portal", "/api/stripe/portal")} size="sm" variant="secondary">
          <Codicon name="credit-card" size="0.8rem" /> {busy === "portal" ? "Opening…" : "Manage billing"}
        </Button>
      </section>

      <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1">
        {visibleCards.map((card) => {
          const tierRank = rankOf(card.tier);
          const isCurrent = snapshot != null && currentRank === tierRank;
          const included = snapshot != null && currentRank > tierRank;
          const price = prices[card.tier];
          const highlighted = isCurrent || (card.recommended && currentRank === 0);
          return (
            <section
              className={cn(
                "flex flex-col rounded-2xl border border-(--ui-stroke-secondary) bg-background p-5",
                highlighted && "border-(--theme-primary) ring-1 ring-(--theme-primary)",
              )}
              key={card.tier}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{card.name}</h3>
                {isCurrent ? (
                  <span className="rounded-full bg-(--theme-primary) px-2 py-0.5 text-[0.65rem] font-semibold text-white">Current</span>
                ) : card.recommended && currentRank === 0 ? (
                  <span className="rounded-full border border-(--theme-primary) px-2 py-0.5 text-[0.65rem] font-semibold text-(--theme-primary)">Recommended</span>
                ) : null}
              </div>
              <p className="mt-3">
                <span className="text-2xl font-semibold tracking-tight">{price.amount}</span>
                <span className="text-xs text-(--ui-text-tertiary)">{price.interval}</span>
              </p>
              <ul className="mt-4 grid gap-2 text-xs leading-relaxed text-(--ui-text-secondary)">
                <li className="font-medium text-foreground">{card.tagline}</li>
                {card.features.map((feature) => (
                  <li className="flex gap-2" key={feature}>
                    <Codicon className="mt-0.5 shrink-0 text-(--theme-primary)" name="check" size="0.75rem" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-4">
                {isCurrent ? (
                  <Button className="w-full" disabled size="sm" variant="secondary">Current plan</Button>
                ) : included ? (
                  <Button className="w-full" disabled size="sm" variant="secondary">Included in your plan</Button>
                ) : currentRank > 0 ? (
                  <Button className="w-full" disabled={busy === "portal"} onClick={() => void post("portal", "/api/stripe/portal")} size="sm" variant="secondary">
                    {busy === "portal" ? "Opening billing…" : "Change plan in billing"}
                  </Button>
                ) : (
                  <Button className="w-full" disabled={busy === card.tier} onClick={() => void post(card.tier, "/api/stripe/checkout", { plan: card.tier })} size="sm" variant="default">
                    {busy === card.tier ? "Opening checkout…" : card.cta}
                  </Button>
                )}
              </div>
              {currentRank === 0 && (
                <p className="mt-3 text-[0.65rem] leading-relaxed text-(--ui-text-quaternary)">
                  Card required. Your subscription starts when you confirm in Stripe. Cancel anytime.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
