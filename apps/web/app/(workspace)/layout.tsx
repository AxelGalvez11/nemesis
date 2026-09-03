"use client";

// Workspace route-group layout: the desktop-parity shell behind the same
// client-side auth gate the AccountPortal uses (no middleware exists — each
// gated surface replicates this pattern; see components/AccountPortal.tsx).

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { CourseworkImportGate } from "@/components/workspace/onboarding/coursework-import-gate";
import { OnboardingGate } from "@/components/workspace/onboarding/onboarding-gate";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { WorkspaceWaiting } from "@/components/workspace/shell/workspace-waiting";
import { signInRedirect } from "@/lib/auth-redirect";
import { SESSION_GRACE_MS, workspaceGate } from "@/lib/workspace-gate";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * When the session went away, and whether there was ever one to go.
   *
   * 🔴🔴🔴 THE WORKSPACE USED TO COME DOWN THE INSTANT `session` WENT FALSY, AND THAT IS WHAT LOST
   * THE OWNER'S WORK. See lib/workspace-gate.ts for the whole account: `@supabase/auth-js` emits a
   * `SIGNED_OUT` with a null session of its own accord when a token refresh loses a race — which
   * two tabs on one account produce routinely — and this layout read that as "signed out", swapped
   * the entire shell for a holding screen, and unmounted the canvas with a turn still running.
   * Nothing was written, because a turn only writes when its answer lands.
   *
   * Refs and one piece of state rather than one of each: `lostAt` has to be readable during the
   * same render that notices the loss (a ref) AND has to be able to wake the component when the
   * grace runs out (a timer writing state). `tick` is that wake-up and nothing else.
   */
  const hadSession = useRef(false);
  const lostAt = useRef<number | null>(null);
  const [, setTick] = useState(0);
  if (session) {
    hadSession.current = true;
    lostAt.current = null;
  } else if (hadSession.current && lostAt.current === null) {
    lostAt.current = Date.now();
  }

  const gate = workspaceGate({
    hadSession: hadSession.current,
    hasSession: Boolean(session),
    loading,
    msSinceLost: lostAt.current === null ? 0 : Date.now() - lostAt.current,
  });

  // 🔴 THE ONLY REASON THIS TIMER EXISTS: nothing else re-renders when a grace period simply runs
  // out. Without it a session that never comes back would leave the workspace mounted for ever,
  // which is the opposite failure and a worse one.
  useEffect(() => {
    if (gate !== "hold") return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), SESSION_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [gate]);

  useEffect(() => {
    if (gate !== "sign-in") return;
    // 🔴 `usePathname()` DOES NOT INCLUDE THE QUERY, and this gate used to send it alone — so
    // `/learn?canvas=<uuid>` came back from sign-in as a bare `/learn`. The search is read off
    // `window` rather than `useSearchParams()` on purpose: that hook forces every route under
    // this layout into a Suspense boundary, and inside an effect `window.location.search` is
    // both always available and always current. See `signInRedirect`.
    router.replace(signInRedirect(pathname, window.location.search));
  }, [gate, pathname, router]);

  // 🔴🔴 NOT `nemesis-account-loading` ANY MORE, AND THAT CLASS WAS THE WHOLE OF THE OWNER'S
  // "the screen goes blank" (2026-08-30). It is the ACCOUNT PORTAL's screen — a full-viewport
  // #080809 ground with the word LOADING at 11px — borrowed by the product, and it is also
  // exactly what the prerendered HTML for `/learn` contains, so it is the first paint of every
  // full page load of the workspace. Worse, nothing clears it but `getSession()` settling, and
  // that call has no timeout: a request that hangs leaves a black screen with nothing to press.
  // `WorkspaceWaiting` keeps the silence and adds the two things it was missing — the product's
  // own ground, and an admission with a way out once the wait stops being normal.
  //
  // 🔴 `hold` IS NOT ONE OF THESE, AND THAT IS THE FIX. A workspace whose session is being
  // refreshed keeps every child mounted and keeps working; painting this over it would unmount
  // them just as surely as returning early did.
  if (gate === "waiting" || gate === "sign-in") return <WorkspaceWaiting />;

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
