"use client";

// Settings → Billing, in the workspace design language.
//
// ── ONE PLAN, SO THERE IS NO LADDER TO CLIMB ─────────────────────────────────
//
// This panel used to render a card per tier with a rank table deciding which
// button each one got: "Current plan", "Included in your plan", "Change plan in
// billing", "Upgrade to Student". With one paid product the whole apparatus goes
// away — a student is either on Free, in which case they can buy Nemesis, or on
// Nemesis, in which case the only billing action left is Stripe's own portal.
//
// 🔴 THE PRICES COME FROM packages/shared, NOT FROM THE STRIPE CATALOG. This
// panel used to render "Price in checkout" whenever the catalog call failed,
// which is a blank where a price should be. The catalog is still fetched, but
// only to WARN: if Stripe disagrees with what we are showing, that is a
// misconfiguration the owner needs to see, not something to hide by showing
// Stripe's number instead.

import { useEffect, useState } from "react";

import {
  annualPerMonthCents,
  annualSavingPercent,
  canonicalPlan,
  formatUsdCents,
  NEMESIS_ANNUAL_CENTS,
  NEMESIS_MONTHLY_CENTS,
  type EntitlementSnapshot,
} from "@nemesis/shared";
import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { useAuth } from "@/components/AuthProvider";
import { fetchEntitlements } from "@/lib/api";
import { INTERVAL_PRICE_CENTS, planLabel, type CheckoutInterval } from "@/lib/billing-contract";
import { phCapture } from "@/lib/posthog";
import { cn } from "@/lib/utils";

interface CatalogPrice {
  unitAmount: number | null;
  currency: string;
  interval: string | null;
}

interface IntervalOption {
  id: CheckoutInterval;
  label: string;
  perMonth: string;
  billedAs: string;
}

const INTERVALS: readonly IntervalOption[] = [
  {
    billedAs: "Billed monthly. Cancel anytime.",
    id: "monthly",
    label: "Monthly",
    perMonth: formatUsdCents(NEMESIS_MONTHLY_CENTS),
  },
  {
    // The real charge sits next to the per-month figure, always: $16.67 is a
    // rounded twelfth of $199.99 and is never itself billed.
    billedAs: `${formatUsdCents(NEMESIS_ANNUAL_CENTS)} billed annually. Cancel anytime.`,
    id: "annual",
    label: `Yearly · Save ${annualSavingPercent()}%`,
    perMonth: formatUsdCents(annualPerMonthCents()),
  },
];

/** The default, and the fallback: an unknown interval can only ever mean the
 *  cheaper commitment, never the larger charge. */
const MONTHLY = INTERVALS[0]!;


const NEMESIS_FEATURES = [
  "Everything in Free, with room for a full course load",
  "Talk to Nemesis out loud, and hear it answer",
  "Answers grounded in the web, with real sources",
  "Enough headroom that you stop thinking about limits",
];

export function BillingSettings() {
  const { session } = useAuth();
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot | null>(null);
  const [priceMismatch, setPriceMismatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [interval, setInterval] = useState<CheckoutInterval>("monthly");

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
        return res.json() as Promise<{ intervals: Record<CheckoutInterval, CatalogPrice> }>;
      })
      .then((body) => {
        if (cancelled) return;
        const disagrees = (["monthly", "annual"] as const).some(
          (id) => body.intervals?.[id]?.unitAmount != null
            && body.intervals[id].unitAmount !== INTERVAL_PRICE_CENTS[id],
        );
        setPriceMismatch(disagrees);
      })
      .catch(() => {
        // Checkout stays authoritative when the price catalog can't be read, and
        // the amounts above come from source control, so there is nothing to fix
        // up here — a failed read is not evidence of a wrong price.
      });
    return () => { cancelled = true; };
  }, [session?.access_token]);

  async function post(action: string, path: string, payload?: Record<string, unknown>) {
    setBusy(action);
    setError(null);
    if (payload?.interval) {
      phCapture("checkout_started", {
        billing_interval: payload.interval,
        plan: "nemesis",
        source: "billing_settings",
      });
    }
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

  const paid = snapshot != null && canonicalPlan(snapshot.plan) === "nemesis";
  const selected = INTERVALS.find((option) => option.id === interval) ?? MONTHLY;

  return (
    <div className="grid gap-4">
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[length:var(--canvas-text-meta)] text-destructive" role="alert">{error}</p>}
      {priceMismatch && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[length:var(--canvas-text-meta)] text-destructive" role="alert">
          Billing is being updated. If checkout shows a different price from the one here, close it and try again shortly.
        </p>
      )}

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-base)_4%,var(--background))] p-5">
        <div>
          <p className="text-[length:var(--canvas-text-meta)] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">Current plan</p>
          <p className="mt-1 text-[length:var(--canvas-text-lead)] font-semibold">{snapshot ? planLabel(snapshot.plan) : "Checking…"}</p>
          <p className="mt-1 max-w-md text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">
            {!snapshot
              ? "Checking subscription status…"
              : paid
                ? "Manage, change or cancel your subscription through Stripe. Switching between monthly and yearly happens there too."
                : "Free is the whole product, for part of the month. Nemesis gives you room for a full course load."}
          </p>
        </div>
        <Button disabled={busy === "portal"} onClick={() => void post("portal", "/api/stripe/portal")} size="sm" variant="secondary">
          <Codicon name="credit-card" size="0.8rem" /> {busy === "portal" ? "Opening…" : "Manage billing"}
        </Button>
      </section>

      {!paid && snapshot != null && (
        <section className="flex flex-col rounded-2xl border border-(--theme-primary) bg-background p-5 ring-1 ring-(--theme-primary)">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[length:var(--canvas-text-small)] font-semibold">Nemesis</h3>
          </div>

          <div className="mt-3 flex gap-1 rounded-full border border-(--ui-stroke-secondary) p-1" role="group" aria-label="Billing period">
            {INTERVALS.map((option) => (
              <button
                aria-pressed={option.id === interval}
                className={cn(
                  "flex-1 rounded-full px-3 py-1.5 text-[length:var(--canvas-text-meta)] font-semibold transition-colors",
                  option.id === interval
                    ? "bg-(--theme-primary) text-white"
                    : "text-(--ui-text-tertiary) hover:text-foreground",
                )}
                key={option.id}
                onClick={() => {
                  setInterval(option.id);
                  phCapture("pricing_interval_selected", { billing_interval: option.id, source: "billing_settings" });
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="mt-4">
            <span className="text-[length:var(--canvas-text-title)] font-semibold tracking-tight">{selected.perMonth}</span>
            <span className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)"> / month</span>
          </p>
          <p className="mt-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{selected.billedAs}</p>

          <ul className="mt-4 grid gap-2 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-secondary)">
            {NEMESIS_FEATURES.map((feature) => (
              <li className="flex gap-2" key={feature}>
                <Codicon className="mt-0.5 shrink-0 text-(--theme-primary)" name="check" size="0.75rem" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-4">
            <Button
              className="w-full"
              disabled={busy === "checkout"}
              onClick={() => void post("checkout", "/api/stripe/checkout", { interval })}
              size="sm"
              variant="default"
            >
              {busy === "checkout" ? "Opening checkout…" : "Get Nemesis"}
            </Button>
          </div>
          <p className="mt-3 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-quaternary)">
            Card required. Your subscription starts when you confirm in Stripe. Cancel anytime.
          </p>
        </section>
      )}
    </div>
  );
}
