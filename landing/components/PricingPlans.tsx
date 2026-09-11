"use client";

import { useState } from "react";

import { IconCheck } from "@/components/FeatureIcons";
import { PlanCta } from "@/components/PlanCta";
import { APP_SIGN_UP } from "@/components/SiteChrome";
import { annualSavingPercent, formatUsdCents, INTERVALS, NEMESIS_MONTHLY_CENTS, type BillingInterval } from "@/lib/pricing";
import { captureCtaClick } from "@/lib/posthog";

/**
 * Two cards and a switch, in sana.ai's pricing panel (app/pricing/pricing.css has the measurements).
 *
 * 🔴 NO COMPARISON MATRIX, DELIBERATELY. The page this replaced once had a six-row table across three tiers, and
 * every cell was a claim that could drift from what the product did (the recording row had drifted by more than 3x).
 * With one paid product there is nothing to compare across columns, and the honest answer fits on two cards.
 *
 * 🔴 NO ARTIFICIAL DIFFERENCE BETWEEN MONTHLY AND YEARLY. The feature list does not change when the switch moves,
 * because the product does not. Only the price and the sentence naming the real charge change.
 *
 * 🔴 THE YEARLY FIGURE NEVER STANDS ALONE. $16.67 is $199.99 over twelve months and nobody is ever charged it, so
 * the line under it always names the real annual charge, and the struck price beside it is the real monthly one.
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
  const annual = interval === "annual";
  const selected = INTERVALS.find((option) => option.id === interval) ?? INTERVALS[0];

  return (
    <section className="pr-stage" id="plans">
      <div className="pr-panel">
        <button
          aria-checked={annual}
          className="pr-toggle"
          onClick={() => setInterval(annual ? "monthly" : "annual")}
          role="switch"
          type="button"
        >
          <span>
            Save <strong>{annualSavingPercent()}%</strong> with yearly billing
          </span>
          <span aria-hidden="true" className="pr-switch" />
        </button>

        <div className="pr-cards">
          <article className="pr-card">
            <div className="pr-card-head">
              <h2 className="pr-name">Free</h2>
              <p className="pr-price">{formatUsdCents(0).replace(".00", "")}</p>
              <p className="pr-sub">Everything Nemesis does, for part of the month. No card.</p>
              <a className="pr-cta pr-cta-quiet" href={APP_SIGN_UP} onClick={() => captureCtaClick("pricing", "Start free")}>
                Start free
              </a>
            </div>
            <ul className="pr-list">
              {FREE_LINES.map((line) => (
                <li key={line}>
                  <IconCheck size={16} />
                  {line}
                </li>
              ))}
            </ul>
          </article>

          <article className="pr-card">
            <div className="pr-card-head">
              <h2 className="pr-name">Nemesis</h2>
              <p className="pr-price">
                {selected.perMonth}/month
                {annual ? (
                  <s>
                    <span className="pr-sr">instead of </span>
                    {formatUsdCents(NEMESIS_MONTHLY_CENTS)}/month
                  </s>
                ) : null}
              </p>
              <p className="pr-sub">{selected.billedAs}</p>
              <PlanCta className="pr-cta pr-cta-solid" interval={interval} />
            </div>
            <ul className="pr-list">
              {NEMESIS_LINES.map((line, index) => (
                <li className={index === 0 ? "is-carry" : undefined} key={line}>
                  <IconCheck size={16} />
                  {line}
                </li>
              ))}
            </ul>
          </article>
        </div>

        <p className="pr-note">
          Monthly and yearly are the same Nemesis; the only difference is how often you pay. Cancel anytime from your
          account. No ads, no selling your data, no training on your content.
        </p>
      </div>
    </section>
  );
}
