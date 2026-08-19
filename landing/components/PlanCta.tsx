"use client";

import { planCheckoutUrl, type BillingInterval } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";

/**
 * The buy button for Nemesis.
 *
 * A separate client component because app/pricing/page.tsx is a server component (it
 * exports `metadata`, which only server components may do) and an onClick handler needs
 * the client. Keeping just the button on the client leaves the rest of the page static.
 *
 * It takes an INTERVAL, not a plan. There is one paid product; what this button
 * carries across to the app is how often the visitor wants to pay for it.
 */
export function PlanCta({
  interval,
  label = "Get Nemesis",
  variant = "primary",
}: {
  interval: BillingInterval;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <a
      className={`btn btn-${variant}`}
      href={planCheckoutUrl(interval)}
      onClick={() => captureCtaClick("pricing", `${label} (${interval})`)}
    >
      {label}
    </a>
  );
}
