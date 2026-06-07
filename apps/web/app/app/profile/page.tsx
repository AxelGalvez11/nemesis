"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, Trash2Icon, UserIcon } from "lucide-react";
import type { EntitlementSnapshot, UsageSnapshot } from "@pharmabro/shared";
import { useAuth } from "@/components/AuthProvider";
import { ErrorText, PageHeader } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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

export default function ProfilePage() {
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
    });
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
      downloadJson(payload, `pharmaorb-account-export-${date}.json`);
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
      <PageHeader title="Profile" eyebrow="Account">
        Your signed-in beta account and current entitlement snapshot.
      </PageHeader>
      <div className="grid two">
        <Card className="account-card">
          <CardHeader>
            <CardTitle className="settings-title-row">
              <UserIcon aria-hidden="true" />
              Account
            </CardTitle>
            <CardDescription>{session?.user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="muted">Educational information only. Not medical advice.</p>
          </CardContent>
        </Card>
        <Card className="account-card">
          <CardHeader>
            <div className="row">
              <CardTitle>Plan</CardTitle>
              <Badge variant="secondary">{ent?.plan ?? "free"}</Badge>
            </div>
            <CardDescription>Current shared entitlement snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="account-stat-list">
            <div>
              <span className="muted">Ask today</span>
              <strong>{ask?.used ?? 0}/{ask?.limit ?? 10}</strong>
            </div>
            <Separator />
            <div>
              <span className="muted">Watchlist limit</span>
              <strong>{String(ent?.entitlements.watchlist_limit ?? 3)}</strong>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="account-actions account-card">
        <CardHeader>
          <CardTitle>Account data</CardTitle>
          <CardDescription>
            Download a JSON copy of your account data or permanently delete your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="account-data-content">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void onExport()}>
            <DownloadIcon data-icon="inline-start" aria-hidden="true" />
            {busy === "export" ? "Exporting..." : "Export data"}
          </Button>
          <Separator />
          <div className="danger-zone">
            <h3>Delete account</h3>
            <p className="muted">Type DELETE to enable permanent account deletion.</p>
            <Input
              aria-label="Delete confirmation"
              aria-invalid={confirmation.length > 0 && !canDelete}
              placeholder="DELETE"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={!canDelete || busy !== null}>
                  <Trash2Icon data-icon="inline-start" aria-hidden="true" />
                  Delete account
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete account?</DialogTitle>
                  <DialogDescription>
                    This permanently removes the auth account and cascades user-owned rows where the backend schema allows it.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => void onDelete()}>
                    <Trash2Icon data-icon="inline-start" aria-hidden="true" />
                    {busy === "delete" ? "Deleting..." : "Delete account"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
        {accountMessage || accountError ? (
          <CardFooter className="account-feedback">
            <div>
              {accountMessage ? <p className="success-text">{accountMessage}</p> : null}
              {accountError ? <ErrorText>{accountError}</ErrorText> : null}
            </div>
          </CardFooter>
        ) : null}
      </Card>
    </>
  );
}
