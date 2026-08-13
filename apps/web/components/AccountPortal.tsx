"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { EntitlementSnapshot } from "@nemesis/shared";
import { useAuth } from "@/components/AuthProvider";
import { fetchEntitlements } from "@/lib/api";
import { DEFAULT_LANDING_PATH } from "@/lib/auth-redirect";
import { landingUrl } from "@/lib/env";
import { planLabel } from "@/lib/billing-contract";

/**
 * The signed-in account page. It had a second "billing" section behind
 * /account/billing until 2026-08-01, when the owner retired that page; plans and
 * payment now live on /pricing, which already handles the return trip from
 * Stripe. This component has one section again, so it takes no props.
 */
export function AccountPortal() {
  const { loading, session, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [entitlements, setEntitlements] = useState<EntitlementSnapshot | null>(null);
  const [entitlementState, setEntitlementState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!loading && !session) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, pathname, router, session]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setEntitlementState("loading");
    void fetchEntitlements()
      .then((snapshot) => {
        if (!alive) return;
        setEntitlements(snapshot);
        setEntitlementState("ready");
      })
      .catch(() => {
        if (!alive) return;
        setEntitlements(null);
        setEntitlementState("error");
      });
    return () => { alive = false; };
  }, [session]);

  if (loading || !session) {
    return <main className="nemesis-account-loading">Loading…</main>;
  }

  const plan = entitlementState === "loading"
    ? "checking…"
    : entitlementState === "error"
      ? "unavailable"
      : entitlements?.plan ?? "free";
  const email = session.user.email ?? "Nemesis account";

  return (
    <main className="nemesis-account-shell">
      <div className="nemesis-account-scanlines" aria-hidden="true" />
      <header className="nemesis-account-header">
        <Link className="nemesis-account-brand" href="/account" aria-label="Nemesis account home">
          <Image src="/nemesis/logo-white.png" alt="" width={34} height={34} priority />
          <span>NEMESIS</span>
        </Link>
        <a className="nemesis-account-site-link" href={landingUrl}>enternemesis.com</a>
      </header>

      <div className="nemesis-account-layout">
        <aside className="nemesis-account-nav">
          <div>
            <p className="nemesis-account-nav-label">Account</p>
            <p className="nemesis-account-nav-email" title={email}>{email}</p>
          </div>
          <nav aria-label="Account sections">
            {/* The front door, not the retired chat surface — see DEFAULT_LANDING_PATH. */}
            <Link href={DEFAULT_LANDING_PATH}>Open Nemesis</Link>
            <Link className="active" href="/account">Overview</Link>
            <Link href="/pricing">Subscription</Link>
          </nav>
          <button
            className="nemesis-account-signout"
            type="button"
            onClick={() => void signOut().then(() => router.replace("/sign-in"))}
          >
            Sign out
          </button>
        </aside>

        <section className="nemesis-account-main">
          <div className="nemesis-account-heading">
            <p>Nemesis // browser control plane</p>
            <h1>Your account.</h1>
            <span>
              Identity and billing live here. Your courses, notes, recordings, and agent workspace are in the app.
            </span>
          </div>

          <div className="nemesis-account-overview">
              <section className="nemesis-account-card primary-card">
                <p className="nemesis-account-card-label">Signed in as</p>
                <h2>{email}</h2>
                <div className="nemesis-account-plan-row">
                  <span>Plan</span>
                  <strong>{plan === "checking…" || plan === "unavailable" ? plan : planLabel(plan)}</strong>
                </div>
                <Link className="nemesis-account-primary-action" href="/pricing">Manage subscription</Link>
              </section>

              <section className="nemesis-account-card desktop-card">
                <p className="nemesis-account-card-label">Your workspace</p>
                <h2>The work stays with Nemesis.</h2>
                <p>
                  Everything happens in the app, right in your browser. Open it and your plan is
                  live inside the agent.
                </p>
                <Link className="nemesis-account-primary-action" href="/">
                  Open Nemesis
                </Link>
                <p className="nemesis-account-fineprint">
                  Works in any modern browser. New features arrive on their own — nothing to install.
                </p>
              </section>
          </div>
        </section>
      </div>
    </main>
  );
}
