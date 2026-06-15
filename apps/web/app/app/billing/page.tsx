"use client";

import { PageHeader } from "@/components/ui";
import { BillingPanel } from "@/components/BillingPanel";

// Full-page Billing (direct URL). The same BillingPanel also renders inside the account-menu overlay.
export default function BillingPage() {
  return (
    <>
      <PageHeader title="Billing" eyebrow="Plans">
        Plus unlocks more cited questions; Pro adds Deep Research — multi-step, fully cited reports.
      </PageHeader>
      <BillingPanel />
    </>
  );
}
