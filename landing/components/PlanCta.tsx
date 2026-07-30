"use client";

import { planCheckoutUrl, type PaidPlan } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";

/**
 * The buy button for one plan.
 *
 * A separate client component because app/pricing/page.tsx is a server component (it
 * exports `metadata`, which only server components may do) and an onClick handler needs
 * the client. Keeping just the button on the client leaves the rest of the page static.
 */
export function PlanCta({
  plan,
  label,
  variant = "secondary",
}: {
  plan: PaidPlan;
  label: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <a
      className={`btn btn-${variant}`}
      href={planCheckoutUrl(plan)}
      onClick={() => captureCtaClick("pricing", label)}
    >
      {label}
    </a>
  );
}
