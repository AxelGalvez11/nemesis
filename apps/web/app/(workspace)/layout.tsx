"use client";

// Workspace route-group layout: the desktop-parity shell behind the same
// client-side auth gate the AccountPortal uses (no middleware exists — each
// gated surface replicates this pattern; see components/AccountPortal.tsx).

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/AuthProvider";
import { OnboardingGate } from "@/components/workspace/onboarding/onboarding-gate";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, pathname, router, session]);

  if (loading || !session) {
    return <main className="nemesis-account-loading">Loading…</main>;
  }

  return (
    <WorkspaceShell>
      {children}
      {/* Renders nothing unless this is a genuinely new account — see
          OnboardingGate for the two guards that decide. Mounted here rather
          than on one page so a student landing anywhere in the workspace gets
          the same welcome. */}
      <OnboardingGate />
    </WorkspaceShell>
  );
}
