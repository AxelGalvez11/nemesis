"use client";

// The last screen: your semester is set up, and here is what Nemesis costs.
//
// SHOWN AFTER THE WORK IS SAVED, NOT BEFORE. It is not a step, it does not
// appear in the progress bar, and it cannot block anything — the folders and
// dates are already written by the time it renders. A student who closes this
// screen has lost nothing, which is the difference between an offer and a
// toll gate.
//
// AND ONLY TO SOMEONE ON THE FREE PLAN. An existing subscriber being sold
// their own plan back on their first day is the kind of thing that makes a
// product feel like it is not paying attention. The caller checks the plan and
// simply does not render this otherwise.
//
// 🔴 THIS SCREEN USED TO SELL RECORDING HOURS, and it cannot any more. Nemesis
// no longer offers lecture or meeting transcription; the honest difference
// between Free and Nemesis is how much of the month you get, plus talking to it
// out loud. One offer now, monthly or yearly, no ladder to compare.

import { useState } from "react";

import { annualPerMonthCents, annualSavingPercent, formatUsdCents, NEMESIS_ANNUAL_CENTS, NEMESIS_MONTHLY_CENTS } from "@nemesis/shared";
import { Button } from "@/components/desktop-ui/button";
import { useAuth } from "@/components/AuthProvider";
import { Check, ExternalLink, Loader2 } from "@/lib/workspace/icons";
import { type CheckoutInterval } from "@/lib/billing-contract";
import { phCapture } from "@/lib/posthog";
import { cn } from "@/lib/utils";

interface Offer {
  id: CheckoutInterval;
  label: string;
  perMonth: string;
  billedAs: string;
  recommended?: boolean;
}

/** Kept deliberately short. The full picture lives on the billing screen; this
 *  is a first-day nudge, not a pricing page. */
const OFFERS: readonly Offer[] = [
  {
    billedAs: "Billed monthly",
    id: "monthly",
    label: "Monthly",
    perMonth: formatUsdCents(NEMESIS_MONTHLY_CENTS),
  },
  {
    // The real charge is on the card, never only the per-month figure.
    billedAs: `${formatUsdCents(NEMESIS_ANNUAL_CENTS)} billed annually`,
    id: "annual",
    label: `Yearly · Save ${annualSavingPercent()}%`,
    perMonth: formatUsdCents(annualPerMonthCents()),
    recommended: true,
  },
];

const NEMESIS_LINES = [
  "Room for a full course load, every week",
  "Talk to Nemesis out loud, and hear it answer",
  "Answers grounded in the web, with real sources",
];

interface StepUpgradeProps {
  /** What the student just set up, so the screen can say something true about
   *  their semester rather than a generic pitch. */
  courseCount: number;
  eventCount: number;
  onDone: () => void;
}

export function StepUpgrade({ courseCount, eventCount, onDone }: StepUpgradeProps) {
  const { session } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(interval: CheckoutInterval) {
    setBusy(interval);
    setError(null);
    phCapture("checkout_started", { billing_interval: interval, from: "onboarding", plan: "nemesis" });
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Sign in first.");
      const res = await fetch("/api/stripe/checkout", {
        body: JSON.stringify({ interval }),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.message || body.error || "Could not open checkout.");
      window.location.href = body.url;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open checkout.");
      setBusy(null);
    }
  }

  const built = [
    courseCount > 0 ? `${courseCount} ${courseCount === 1 ? "course" : "courses"}` : null,
    eventCount > 0 ? `${eventCount} ${eventCount === 1 ? "date" : "dates"}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">You&rsquo;re set up</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {built.length > 0
            ? `${built.join(" and ")} are ready. Everything below is optional — you can start using Nemesis right now.`
            : "You can start using Nemesis right now. Everything below is optional."}
        </p>
      </div>

      <div className="rounded-xl border border-border p-3">
        <p className="text-xs font-medium text-foreground">Your free plan is the whole product</p>
        <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
          Same chat, same teaching, same reasoning. Nemesis is the same thing with room for a full course load,
          and the ability to talk to it out loud.
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {NEMESIS_LINES.map((line) => (
          <li className="flex gap-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground" key={line}>
            <Check className="mt-0.5 shrink-0 text-(--theme-primary)" size={12} />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {error && (
        <p className="rounded-lg border border-(--ui-danger)/40 bg-(--ui-danger)/10 px-3 py-2 text-xs text-(--ui-danger)">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {OFFERS.map((offer) => (
          <section
            className={cn(
              "flex flex-col rounded-xl border border-border p-4",
              offer.recommended && "border-(--theme-primary) ring-1 ring-(--theme-primary)",
            )}
            key={offer.id}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{offer.label}</h3>
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">{offer.perMonth}<span className="text-xs font-normal text-muted-foreground"> / month</span></p>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{offer.billedAs}</p>
            <div className="mt-auto pt-3">
              <Button
                className="w-full"
                disabled={busy !== null}
                onClick={() => void checkout(offer.id)}
                size="sm"
                variant={offer.recommended ? "default" : "secondary"}
              >
                {busy === offer.id ? (
                  <>
                    <Loader2 className="animate-spin" size={13} /> Opening checkout
                  </>
                ) : (
                  <>
                    Get Nemesis <ExternalLink size={13} />
                  </>
                )}
              </Button>
            </div>
          </section>
        ))}
      </div>

      <button
        className="self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={onDone}
        type="button"
      >
        Maybe later
      </button>
    </div>
  );
}
