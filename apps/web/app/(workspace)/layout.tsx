"use client";

// Workspace route-group layout: the desktop-parity shell behind the same
// client-side auth gate the AccountPortal uses (no middleware exists — each
// gated surface replicates this pattern; see components/AccountPortal.tsx).

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/AuthProvider";
import { CourseworkImportGate } from "@/components/workspace/onboarding/coursework-import-gate";
import { OnboardingGate } from "@/components/workspace/onboarding/onboarding-gate";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { WorkspaceWaiting } from "@/components/workspace/shell/workspace-waiting";
import { signInRedirect } from "@/lib/auth-redirect";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) {
      // 🔴 `usePathname()` DOES NOT INCLUDE THE QUERY, and this gate used to send it alone — so
      // `/learn?canvas=<uuid>` came back from sign-in as a bare `/learn`. The search is read off
      // `window` rather than `useSearchParams()` on purpose: that hook forces every route under
      // this layout into a Suspense boundary, and inside an effect `window.location.search` is
      // both always available and always current. See `signInRedirect`.
      router.replace(signInRedirect(pathname, window.location.search));
    }
  }, [loading, pathname, router, session]);

  // 🔴🔴 NOT `nemesis-account-loading` ANY MORE, AND THAT CLASS WAS THE WHOLE OF THE OWNER'S
  // "the screen goes blank" (2026-08-30). It is the ACCOUNT PORTAL's screen — a full-viewport
  // #080809 ground with the word LOADING at 11px — borrowed by the product, and it is also
  // exactly what the prerendered HTML for `/learn` contains, so it is the first paint of every
  // full page load of the workspace. Worse, nothing clears it but `getSession()` settling, and
  // that call has no timeout: a request that hangs leaves a black screen with nothing to press.
  // `WorkspaceWaiting` keeps the silence and adds the two things it was missing — the product's
  // own ground, and an admission with a way out once the wait stops being normal.
  if (loading || !session) return <WorkspaceWaiting />;

  return (
    <WorkspaceShell>
      {children}
      {/* Renders nothing unless this is a genuinely new account — see
          OnboardingGate for the two guards that decide. Mounted here rather
          than on one page so a student landing anywhere in the workspace gets
          the same welcome. */}
      <OnboardingGate />
      {/* And for everyone past their first day: if the extension is holding a
          reading of their school portal, offer to bring it in. Without this a
          scan had nowhere to go once onboarding was over. */}
      <CourseworkImportGate />
    </WorkspaceShell>
  );
}
