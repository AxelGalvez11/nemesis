"use client";

import { useEffect, useState } from "react";
import type { EntitlementSnapshot, UsageSnapshot } from "@nemesis/shared";
import { useAuth } from "@/components/AuthProvider";
import { Badge, Card, ErrorText } from "@/components/ui";
import { deleteMyAccount, exportMyData, fetchEntitlements, fetchUsage } from "@/lib/api";

function downloadJson(payload: Record<string, unknown>, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Profile content (account, plan, data export + account deletion), with NO page header — the host
 * supplies the heading. Reused by both /app/profile (full page) and the account-menu Profile overlay.
 */
export function ProfilePanel() {
  const { session, signOut } = useAuth();
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([fetchEntitlements(), fetchUsage()]).then(([e, u]) => {
      setEnt(e);
      setUsage(u);
    }).catch(() => {});
  }, []);

  const ask = usage?.counters.ask_daily;
  const canDelete = confirmation.trim() === "DELETE";

  async function onExport() {
    setBusy("export");
    setAccountError(null);
    setAccountMessage(null);
    try {
      const payload = await exportMyData();
      const date = new Date().toISOString().slice(0, 10);
      downloadJson(payload, `nemesis-account-export-${date}.json`);
      setAccountMessage("Account export downloaded.");
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!canDelete) return;
    setBusy("delete");
    setAccountError(null);
    setAccountMessage(null);
    try {
      await deleteMyAccount();
      await signOut();
      window.location.assign("/sign-in?deleted=1");
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Account deletion failed");
      setBusy(null);
    }
  }

  return (
    <>
      <div className="grid two">
        <Card>
          <h2 style={{ marginBottom: 6 }}>Account</h2>
          <p style={{ margin: "0 0 4px", fontWeight: 500 }}>{session?.user.email}</p>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Educational information only. Not medical advice.</p>
        </Card>
        <Card>
          <div className="row" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Plan</h2>
            <Badge>{ent?.plan ?? "free"}</Badge>
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 14 }}>Ask today: {ask?.used ?? 0}/{ask?.limit ?? 10}</p>
          <p style={{ margin: 0, fontSize: 14 }}>Monitoring watches: {String(ent?.entitlements.watch_limit ?? 1)}</p>
        </Card>
      </div>
      <Card className="account-actions">
        <h2 style={{ marginBottom: 6 }}>Account data</h2>
        <p className="muted" style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.55 }}>
          Download a JSON copy of your account data or permanently delete your account.
          Deletion removes the auth account and cascades user-owned rows where the backend schema allows it.
        </p>
        <div className="action-row">
          <button type="button" className="secondary" disabled={busy !== null} onClick={() => void onExport()}>
            {busy === "export" ? "Exporting..." : "Export data"}
          </button>
        </div>
        <div className="danger-zone">
          <h3 style={{ fontSize: 15 }}>Delete account</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Type DELETE to enable permanent account deletion.</p>
          <input
            aria-label="Delete confirmation"
            placeholder="DELETE"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <button type="button" className="danger-button" disabled={!canDelete || busy !== null} onClick={() => void onDelete()}>
            {busy === "delete" ? "Deleting..." : "Delete account"}
          </button>
        </div>
        {accountMessage ? <p className="success-text">{accountMessage}</p> : null}
        {accountError ? <ErrorText>{accountError}</ErrorText> : null}
      </Card>
    </>
  );
}
