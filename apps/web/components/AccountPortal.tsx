"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { EntitlementSnapshot } from "@nemesis/shared";
import { BillingPanel } from "@/components/BillingPanel";
import { useAuth } from "@/components/AuthProvider";
import { fetchEntitlements } from "@/lib/api";
import { landingUrl } from "@/lib/env";
import { planLabel } from "@/lib/billing-contract";

interface AccountPortalProps {
  section: "overview" | "billing";
  checkoutStatus?: string;
}

export function AccountPortal({ section, checkoutStatus }: AccountPortalProps) {
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
    return <main className="nemesis-account-loading">Restoring account perimeter…</main>;
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
            <p className="nemesis-account-nav-label">Account perimeter</p>
            <p className="nemesis-account-nav-email" title={email}>{email}</p>
          </div>
          <nav aria-label="Account sections">
            <Link href="/sessions">Open Nemesis</Link>
            <Link className={section === "overview" ? "active" : ""} href="/account">Overview</Link>
            <Link className={section === "billing" ? "active" : ""} href="/account/billing">Subscription</Link>
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
            <h1>{section === "billing" ? "Subscription." : "Your account."}</h1>
            <span>
              {section === "billing"
                ? "Manage your Nemesis plan. Payments open securely in Stripe."
                : "Identity and billing live here. Your courses, notes, recordings, and agent workspace are in the app."}
            </span>
          </div>

          {section === "overview" ? (
            <div className="nemesis-account-overview">
              <section className="nemesis-account-card primary-card">
                <p className="nemesis-account-card-label">Current containment</p>
                <h2>{email}</h2>
                <div className="nemesis-account-plan-row">
                  <span>Plan</span>
                  <strong>{plan === "checking…" || plan === "unavailable" ? plan : planLabel(plan)}</strong>
                </div>
                <Link className="nemesis-account-primary-action" href="/account/billing">Manage subscription</Link>
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
          ) : (
            <div className="nemesis-account-billing">
              <BillingPanel checkoutStatus={checkoutStatus} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
