"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { EntitlementSnapshot } from "@pharmabro/shared";
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
          <Image src="/nemesis/logo-4k.png" alt="" width={34} height={34} priority />
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
                ? "Manage the plan attached to your desktop instance. Payments open securely in Stripe."
                : "Identity and billing live here. Your courses, notes, recordings, and agent workspace stay in the desktop app."}
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
                <p className="nemesis-account-card-label">Desktop first</p>
                <h2>The work stays with Nemesis.</h2>
                <p>
                  Everything happens in the desktop app. Download it, sign in with this account,
                  and your plan is live inside the agent.
                </p>
                <a className="nemesis-account-primary-action" href="/api/download/mac">
                  Download for macOS
                </a>
                <p className="nemesis-account-fineprint">
                  Apple Silicon Macs (M1 or newer). New versions announce themselves inside the app.
                </p>
                <div className="nemesis-account-boundary">
                  <span>Browser</span><b>Account + billing</b>
                  <span>Desktop</span><b>Courses + agent workspace</b>
                </div>
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
