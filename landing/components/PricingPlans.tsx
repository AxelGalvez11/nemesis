"use client";

import { useState } from "react";

import { IconCheck } from "@/components/FeatureIcons";
import { PlanCta } from "@/components/PlanCta";
import { APP_SIGN_UP } from "@/components/SiteChrome";
import { annualSavingPercent, INTERVALS, type BillingInterval } from "@/lib/pricing";
import { captureCtaClick } from "@/lib/posthog";

/**
 * Two cards and a switch.
 *
 * 🔴 NO COMPARISON MATRIX, DELIBERATELY. The page it replaces had a six-row
 * table across three tiers, and every cell was a claim that could drift away
 * from what the product actually did — the recording row had drifted by more
 * than 3x once. With one paid product there is nothing to compare across
 * columns, and the honest answer fits on two cards.
 *
 * 🔴 AND NO ARTIFICIAL DIFFERENCE BETWEEN MONTHLY AND YEARLY. The feature list
 * does not change when the switch moves, because the product does not. The only
 * thing that changes is the price and the sentence naming the real charge.
 */

const FREE_LINES = [
  "The same teaching Canvas, and the same reasoning behind it",
  "Bring your own lectures, slides, notes and readings",
  "A calendar built from your syllabus",
  "The phone app, included",
];

const NEMESIS_LINES = [
  "Everything in Free, with room for a full course load",
  "Talk to Nemesis out loud, and hear it answer",
  "Answers grounded in the web, with real sources",
  "Enough headroom that you stop thinking about limits",
];

export function PricingPlans() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const selected = INTERVALS.find((option) => option.id === interval) ?? INTERVALS[0];

  return (
    <div className="plans plans-two">
      <div className="plan" data-reveal="up">
        <div className="plan-price">$0<span className="per">/mo</span></div>
        <h3>Free</h3>
        <p className="plan-desc">Everything Nemesis does, for part of the month.</p>
        <ul className="plan-features">
          {FREE_LINES.map((line) => (
            <li key={line}><IconCheck size={13} />{line}</li>
          ))}
        </ul>
        <div className="plan-cta">
          <a
            className="btn btn-secondary"
            href={APP_SIGN_UP}
            onClick={() => captureCtaClick("pricing", "Continue free")}
          >
            Continue free
          </a>
          <p className="plan-note">No card required</p>
        </div>
      </div>

      <div className="plan plan-featured" data-reveal="up">
        <div className="plan-toggle" role="group" aria-label="Billing period">
          {INTERVALS.map((option) => (
            <button
              aria-pressed={option.id === interval}
              className={`plan-toggle-opt${option.id === interval ? " is-on" : ""}`}
              key={option.id}
              onClick={() => setInterval(option.id)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="plan-price">{selected.perMonth}<span className="per">/mo</span></div>
        <h3>Nemesis</h3>
        <p className="plan-desc">{selected.billedAs}</p>
        <ul className="plan-features">
          {NEMESIS_LINES.map((line) => (
            <li key={line}><IconCheck size={13} />{line}</li>
          ))}
        </ul>
        <div className="plan-cta">
          <PlanCta interval={interval} />
          <p className="plan-note">
            {interval === "annual"
              ? `Save ${annualSavingPercent()}% against paying monthly`
              : "Switch to yearly whenever you like"}
          </p>
        </div>
      </div>
    </div>
  );
}
