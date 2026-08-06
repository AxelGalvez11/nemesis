"use client";

// The last screen: your semester is set up, and here is what more costs.
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
// The numbers here are recording hours, because that is the honest difference
// between the tiers — it is the one cost that scales with use, roughly sixteen
// times the whole AI lane for a heavy student. Everything else is limits the
// free plan already gives generously.

import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { useAuth } from "@/components/AuthProvider";
import { Check, ExternalLink, Loader2 } from "@/lib/workspace/icons";
import { phCapture } from "@/lib/posthog";
import { cn } from "@/lib/utils";

/** Kept deliberately short. The full comparison lives on the billing screen;
 *  this is a first-day nudge, not a pricing page.
 *
 *  🔴 Recording hours must match plan_entitlements.transcription_seconds_month_limit,
 *  the cards in billing-settings.tsx, and app/pricing/page.tsx. Those three had
 *  already drifted apart by more than 3x once. */
interface Offer {
  tier: "plus" | "pro";
  name: string;
  hours: string;
  lines: string[];
  recommended?: boolean;
}

const OFFERS: readonly Offer[] = [
  {
    hours: "30 hours",
    lines: ["Higher limits for answers, notes and decks", "Turn lectures into study material"],
    name: "Student",
    tier: "plus",
  },
  {
    hours: "70 hours",
    lines: ["Everything in Student", "Answers grounded in the web, with sources"],
    name: "Agent Pro",
    recommended: true,
    tier: "pro",
  },
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

  async function checkout(tier: Offer["tier"]) {
    setBusy(tier);
    setError(null);
    phCapture("checkout_started", { from: "onboarding", plan: tier });
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Sign in first.");
      const res = await fetch("/api/stripe/checkout", {
        body: JSON.stringify({ plan: tier }),
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
        <p className="text-xs font-medium text-foreground">Your free plan includes 1 hour of lecture recording a month</p>
        <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
          Enough to run a whole class through it end to end. Recording is the one thing that costs real money to run, so
          it is what the paid plans mostly buy you.
        </p>
      </div>

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
            key={offer.tier}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{offer.name}</h3>
              {offer.recommended && (
                <span className="rounded-full border border-(--theme-primary) px-2 py-0.5 text-[0.625rem] font-semibold text-(--theme-primary)">
                  Most picked
                </span>
              )}
            </div>
            <p className="mt-2 text-xs font-medium text-foreground">{offer.hours} of recording a month</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {offer.lines.map((line) => (
                <li className="flex gap-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground" key={line}>
                  <Check className="mt-0.5 shrink-0 text-(--theme-primary)" size={12} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-3">
              <Button
                className="w-full"
                disabled={busy !== null}
                onClick={() => void checkout(offer.tier)}
                size="sm"
                type="button"
                variant={offer.recommended ? "default" : "outline"}
              >
                {busy === offer.tier ? (
                  <>
                    <Loader2 className="animate-spin" size={13} /> Opening checkout…
                  </>
                ) : (
                  <>
                    See {offer.name} <ExternalLink size={12} />
                  </>
                )}
              </Button>
            </div>
          </section>
        ))}
      </div>

      {/* Said plainly, because the price is not on this screen and a student
          should never reach a card form by surprise. */}
      <p className="text-[0.6875rem] text-(--ui-text-tertiary)">
        Prices are shown in checkout before anything is charged. Cancel any time.
      </p>

      <div className="flex justify-end">
        <Button onClick={onDone} type="button" variant="outline">
          Start using Nemesis
        </Button>
      </div>
    </div>
  );
}
