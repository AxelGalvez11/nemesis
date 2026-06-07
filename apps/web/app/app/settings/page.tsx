"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Card, PageHeader } from "@/components/ui";

export default function SettingsPage() {
  const { session, signOut } = useAuth();

  return (
    <>
      <PageHeader title="Settings" eyebrow="Account">
        Manage your account, billing, data controls, and legal pages.
      </PageHeader>
      <div className="settings-grid">
        <Card>
          <h2>Account</h2>
          <p className="muted">{session?.user.email ?? "Signed in"}</p>
          <div className="settings-links">
            <Link className="settings-link" href="/app/profile">Profile and data</Link>
            <button type="button" className="settings-link button-reset" onClick={() => void signOut().then(() => window.location.assign("/sign-in"))}>
              Sign out
            </button>
          </div>
        </Card>
        <Card>
          <h2>Plan and billing</h2>
          <p className="muted">Manage Plus checkout, invoices, and subscription status.</p>
          <div className="settings-links">
            <Link className="settings-link" href="/app/billing">Billing</Link>
          </div>
        </Card>
        <Card>
          <h2>Privacy and legal</h2>
          <p className="muted">Review data, terms, and medical-use boundaries.</p>
          <div className="settings-links">
            <Link className="settings-link" href="/legal/privacy">Privacy policy</Link>
            <Link className="settings-link" href="/legal/terms">Terms</Link>
            <Link className="settings-link" href="/legal/disclaimer">Medical disclaimer</Link>
          </div>
        </Card>
      </div>
    </>
  );
}
