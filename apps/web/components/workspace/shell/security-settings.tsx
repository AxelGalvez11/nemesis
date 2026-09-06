"use client";

// Settings → Security & login (owner 2026-07-20 evening): change password,
// two-step verification with an authenticator app (fully working via
// Supabase MFA), plus passkey and text-message rows that degrade with a
// plain-English notice when the identity service doesn't have those factor
// types switched on yet. Verifying a factor here upgrades the session, and
// sign-in asks for the 6-digit code once a verified factor exists.

import type { Factor } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";
import { Input } from "@/components/desktop-ui/input";
import { useAuth } from "@/components/AuthProvider";
import { deleteMyAccount, exportMyData } from "@/lib/api";
import { friendlySignInError } from "@/lib/auth-errors";
import { isPreviewMode } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";

function friendlyMfaError(cause: unknown, kind: "phone" | "webauthn" | "totp"): string {
  const message = cause instanceof Error ? cause.message : String(cause ?? "");
  const lowered = message.toLowerCase();
  if (kind === "phone" && /(sms|provider|disabled|not enabled|unsupported)/.test(lowered)) {
    return "Text-message codes aren't available on Nemesis yet. We have to switch them on with our identity service first.";
  }
  if (kind === "webauthn" && /(webauthn|disabled|not enabled|unsupported|factor type)/.test(lowered)) {
    return "Passkeys and security keys aren't available on Nemesis yet. Coming soon.";
  }
  return message || "That didn't work. Try again.";
}

// The name a learner sees on their account. Google sign-in fills full_name or name; a name typed
// here is saved as display_name and wins over both.
function currentDisplayName(metadata: Record<string, unknown> | undefined): string {
  for (const key of ["display_name", "full_name", "name"]) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function qrImageSource(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`;
}

interface TotpEnrollment {
  factorId: string;
  qr: string;
  secret: string;
}

interface PhoneEnrollment {
  factorId: string;
  challengeId: string;
  phone: string;
}

export function SecuritySettings() {
  const confirm = useConfirm();
  const { session, signOut } = useAuth();
  const router = useRouter();
  const canManage = Boolean(session) && !isPreviewMode;

  const [factors, setFactors] = useState<Factor[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const savedDisplayName = currentDisplayName(session?.user.user_metadata);
  const [displayName, setDisplayName] = useState(savedDisplayName);
  const [savingName, setSavingName] = useState(false);
  useEffect(() => {
    setDisplayName(savedDisplayName);
  }, [savedDisplayName]);

  const [newEmail, setNewEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const [totp, setTotp] = useState<TotpEnrollment | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneEnrollment, setPhoneEnrollment] = useState<PhoneEnrollment | null>(null);
  const [phoneCode, setPhoneCode] = useState("");
  const [workingFactor, setWorkingFactor] = useState<string | null>(null);

  const loadFactors = useCallback(async () => {
    if (!canManage) return;
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      setFactors(data?.all ?? []);
    } catch {
      // Factor list is progressive enhancement; the section still renders.
    }
  }, [canManage]);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  const verifiedFactors = factors.filter((factor) => factor.status === "verified");

  // Delete account: a typed DELETE inside a dialog, then the route that cancels billing, clears
  // files and removes the login. Export: the export_my_data RPC saved as a JSON file.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function downloadMyData() {
    setError(null);
    setExporting(true);
    try {
      const payload = await exportMyData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nemesis-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't prepare the export.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    if (deleteTyped !== "DELETE") return;
    setError(null);
    setDeleting(true);
    try {
      await deleteMyAccount();
      window.location.assign("/sign-in?deleted=1");
    } catch (cause) {
      setDeleting(false);
      setDeleteOpen(false);
      setError(cause instanceof Error ? cause.message : "Couldn't delete the account. Try again or email support.");
    }
  }

  async function saveDisplayName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError("Type a name first.");
      return;
    }
    if (trimmed.length > 80) {
      setError("Keep the name under 80 characters.");
      return;
    }
    setSavingName(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
      if (updateError) throw updateError;
      setDisplayName(trimmed);
      setNotice("Name saved.");
    } catch (cause) {
      setError(friendlySignInError(cause instanceof Error ? cause.message : "Couldn't save the name."));
    } finally {
      setSavingName(false);
    }
  }

  async function changeEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const target = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setError("That doesn't look like a valid email address.");
      return;
    }
    if (target === (session?.user.email ?? "").toLowerCase()) {
      setError("That is already the email on this account.");
      return;
    }
    setSendingEmail(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ email: target });
      if (updateError) throw updateError;
      setNewEmail("");
      setNotice(`Check ${target} for a confirmation link. Your email changes once you open it.`);
    } catch (cause) {
      setError(friendlySignInError(cause instanceof Error ? cause.message : "Couldn't send the confirmation."));
    } finally {
      setSendingEmail(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (password.length < 8) {
      setError("Pick a password of at least 8 characters.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("The two password fields don't match.");
      return;
    }
    setSavingPassword(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setPasswordConfirm("");
      setNotice("Password updated. Use it the next time you sign in.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't update the password.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function startTotp() {
    setError(null);
    setNotice(null);
    setWorkingFactor("totp");
    try {
      // Clear abandoned unverified enrollments so re-enrolling never collides.
      for (const factor of factors.filter((item) => item.factor_type === "totp" && item.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => {});
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
      if (enrollError || !data) throw enrollError ?? new Error("Enrollment failed.");
      setTotpCode("");
      setTotp({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (cause) {
      setError(friendlyMfaError(cause, "totp"));
    } finally {
      setWorkingFactor(null);
    }
  }

  async function confirmTotp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!totp) return;
    setError(null);
    setWorkingFactor("totp-verify");
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totp.factorId });
      if (challengeError || !challenge) throw challengeError ?? new Error("Challenge failed.");
      const { error: verifyError } = await supabase.auth.mfa.verify({ challengeId: challenge.id, code: totpCode.trim(), factorId: totp.factorId });
      if (verifyError) throw verifyError;
      setTotp(null);
      setNotice("Authenticator app connected. Sign-in now asks for a 6-digit code.");
      await loadFactors();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That code didn't match. Try the newest one.");
    } finally {
      setWorkingFactor(null);
    }
  }

  async function cancelTotp() {
    const enrollment = totp;
    setTotp(null);
    if (enrollment) await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId }).catch(() => {});
  }

  async function addPasskey() {
    setError(null);
    setNotice(null);
    setWorkingFactor("webauthn");
    try {
      const mfa = supabase.auth.mfa as typeof supabase.auth.mfa & {
        webauthn?: { enroll: (params: { friendlyName: string }) => Promise<{ data: unknown; error: Error | null }> };
      };
      if (!mfa.webauthn) throw new Error("webauthn unsupported");
      const { error: enrollError } = await mfa.webauthn.enroll({ friendlyName: "Passkey" });
      if (enrollError) throw enrollError;
      setNotice("Passkey added.");
      await loadFactors();
    } catch (cause) {
      setError(friendlyMfaError(cause, "webauthn"));
    } finally {
      setWorkingFactor(null);
    }
  }

  async function startPhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setWorkingFactor("phone");
    try {
      for (const factor of factors.filter((item) => item.factor_type === "phone" && item.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => {});
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "phone", friendlyName: "Text message", phone: phoneNumber.trim() });
      if (enrollError || !data) throw enrollError ?? new Error("Enrollment failed.");
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (challengeError || !challenge) throw challengeError ?? new Error("Couldn't send the text message.");
      setPhoneCode("");
      setPhoneEnrollment({ challengeId: challenge.id, factorId: data.id, phone: phoneNumber.trim() });
    } catch (cause) {
      setError(friendlyMfaError(cause, "phone"));
      setPhoneDialogOpen(false);
    } finally {
      setWorkingFactor(null);
    }
  }

  async function confirmPhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phoneEnrollment) return;
    setError(null);
    setWorkingFactor("phone-verify");
    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({ challengeId: phoneEnrollment.challengeId, code: phoneCode.trim(), factorId: phoneEnrollment.factorId });
      if (verifyError) throw verifyError;
      setPhoneEnrollment(null);
      setPhoneDialogOpen(false);
      setNotice("Text-message codes connected. Sign-in now asks for a code.");
      await loadFactors();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That code didn't match.");
    } finally {
      setWorkingFactor(null);
    }
  }

  async function removeFactor(factor: Factor) {
    if (!(await confirm({
      body: "You will no longer be asked for a code from it when you sign in.",
      confirmLabel: "Remove",
      title: `Remove “${factor.friendly_name || factor.factor_type}”?`,
    }))) return;
    setError(null);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) throw unenrollError;
      setNotice("Two-step method removed.");
      await loadFactors();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't remove that method.");
    }
  }

  const factorLabel = (factor: Factor) =>
    factor.friendly_name
    || (factor.factor_type === "totp" ? "Authenticator app" : factor.factor_type === "phone" ? "Text message" : "Passkey");

  return (
    <div className="grid gap-4">
      {notice && <p className="rounded-lg bg-(--ui-bg-tertiary) px-3 py-2 text-[length:var(--canvas-text-meta)] text-foreground" role="status">{notice}</p>}
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[length:var(--canvas-text-meta)] text-destructive" role="alert">{error}</p>}

      <section className="rounded-2xl border border-(--ui-stroke-secondary) bg-background p-4 shadow-sm">
        <h3 className="mb-1 text-[length:var(--canvas-text-meta)] font-semibold">Account</h3>
        <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">Signed in as <span className="text-foreground">{session?.user.email ?? "Preview account"}</span></p>

        <form className="mt-3 grid max-w-sm gap-2" onSubmit={saveDisplayName}>
          <label className="text-[length:var(--canvas-text-meta)] font-medium" htmlFor="account-display-name">Display name</label>
          <Input autoComplete="name" disabled={!canManage} id="account-display-name" maxLength={80} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" value={displayName} />
          <div><Button disabled={!canManage || savingName || !displayName.trim() || displayName.trim() === savedDisplayName} size="sm" type="submit" variant="secondary">{savingName ? "Saving…" : "Save name"}</Button></div>
        </form>

        <form className="mt-4 grid max-w-sm gap-2" onSubmit={changeEmail}>
          <label className="text-[length:var(--canvas-text-meta)] font-medium" htmlFor="account-new-email">Change email</label>
          <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">We send a confirmation link to the new address. Nothing changes until you open it.</p>
          <Input autoComplete="email" disabled={!canManage} id="account-new-email" inputMode="email" onChange={(event) => setNewEmail(event.target.value)} placeholder="new@example.com" type="email" value={newEmail} />
          <div><Button disabled={!canManage || sendingEmail || !newEmail.trim()} size="sm" type="submit" variant="secondary">{sendingEmail ? "Sending…" : "Send confirmation"}</Button></div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void signOut().then(() => router.replace("/sign-in"))} size="sm" variant="ghost">Log out</Button>
        </div>
      </section>

      <section className="rounded-2xl border border-(--ui-stroke-secondary) bg-background p-4 shadow-sm">
        <h3 className="mb-1 text-[length:var(--canvas-text-meta)] font-semibold">Password</h3>
        <p className="mb-3 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">Set a new password for signing in. If you joined with Google, this adds a password you can use too.</p>
        <form className="grid max-w-sm gap-2" onSubmit={changePassword}>
          <Input autoComplete="new-password" disabled={!canManage} onChange={(event) => setPassword(event.target.value)} placeholder="New password" type="password" value={password} />
          <Input autoComplete="new-password" disabled={!canManage} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="Repeat new password" type="password" value={passwordConfirm} />
          <div><Button disabled={!canManage || savingPassword || !password} size="sm" type="submit" variant="secondary">{savingPassword ? "Updating…" : "Update password"}</Button></div>
        </form>
      </section>

      <section className="rounded-2xl border border-(--ui-stroke-secondary) bg-background p-4 shadow-sm">
        <h3 className="mb-1 text-[length:var(--canvas-text-meta)] font-semibold">Two-step verification</h3>
        <p className="mb-3 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">Add a second check at sign-in so a stolen password alone can't open your account.</p>

        {verifiedFactors.length > 0 && (
          <ul className="mb-3 grid gap-2">
            {verifiedFactors.map((factor) => (
              <li className="flex items-center justify-between gap-3 rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2" key={factor.id}>
                <span className="flex items-center gap-2 text-[length:var(--canvas-text-meta)]">
                  <Codicon className="text-(--theme-primary)" name="shield" size="0.85rem" />
                  {factorLabel(factor)}
                </span>
                <Button onClick={() => void removeFactor(factor)} size="sm" variant="ghost">Remove</Button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2.5">
            <div>
              <p className="text-[length:var(--canvas-text-meta)] font-medium">Authenticator app</p>
              <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Google Authenticator, 1Password, Apple Passwords: scan a code once, then enter 6-digit codes.</p>
            </div>
            <Button disabled={!canManage || workingFactor === "totp"} onClick={() => void startTotp()} size="sm" variant="secondary">{workingFactor === "totp" ? "Preparing…" : "Add"}</Button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2.5">
            <div>
              <p className="text-[length:var(--canvas-text-meta)] font-medium">Security key or passkey</p>
              <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Touch ID, Face ID, or a hardware key.</p>
            </div>
            <Button disabled={!canManage || workingFactor === "webauthn"} onClick={() => void addPasskey()} size="sm" variant="secondary">{workingFactor === "webauthn" ? "Waiting…" : "Add"}</Button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2.5">
            <div>
              <p className="text-[length:var(--canvas-text-meta)] font-medium">Text message</p>
              <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Get a code by SMS at sign-in.</p>
            </div>
            <Button disabled={!canManage || workingFactor === "phone"} onClick={() => { setPhoneNumber(""); setPhoneEnrollment(null); setPhoneDialogOpen(true); }} size="sm" variant="secondary">Add</Button>
          </div>
        </div>
        {!canManage && <p className="mt-3 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Sign in on the real app to manage security settings.</p>}
      </section>

      <section className="rounded-2xl border border-(--ui-stroke-secondary) bg-background p-4 shadow-sm">
        <h3 className="mb-1 text-[length:var(--canvas-text-meta)] font-semibold">Your data</h3>
        <p className="mb-3 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">Download a copy of everything Nemesis holds for you, or delete the account. Deleting cancels any subscription, removes your uploads, and cannot be undone.</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canManage || exporting} onClick={() => void downloadMyData()} size="sm" variant="secondary">{exporting ? "Preparing…" : "Download my data"}</Button>
          <Button disabled={!canManage} onClick={() => { setDeleteTyped(""); setDeleteOpen(true); }} size="sm" variant="ghost">Delete account</Button>
        </div>
      </section>

      <Dialog onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }} open={deleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your Nemesis account?</DialogTitle>
            <DialogDescription>Your chats, canvases, uploads, study sets and settings will be removed, and any subscription cancelled. This cannot be undone. Type DELETE to confirm.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Type DELETE to confirm" autoFocus onChange={(event) => setDeleteTyped(event.target.value.toUpperCase())} placeholder="DELETE" value={deleteTyped} />
          <DialogFooter>
            <Button disabled={deleting} onClick={() => setDeleteOpen(false)} size="sm" variant="ghost">Keep my account</Button>
            <Button disabled={deleting || deleteTyped !== "DELETE"} onClick={() => void deleteAccount()} size="sm" variant="destructive">{deleting ? "Deleting…" : "Delete everything"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => { if (!open) void cancelTotp(); }} open={totp !== null}>
        <DialogContent className="max-w-md">
          <form className="grid gap-4" onSubmit={confirmTotp}>
            <DialogHeader>
              <DialogTitle>Connect an authenticator app</DialogTitle>
              <DialogDescription>Scan the code with your authenticator app, then type the 6-digit code it shows.</DialogDescription>
            </DialogHeader>
            {totp && (
              <div className="grid justify-items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="QR code for your authenticator app" className="size-40 rounded-lg border border-(--ui-stroke-tertiary) bg-white p-2" src={qrImageSource(totp.qr)} />
                <p className="max-w-full break-all text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Can't scan? Enter this key manually: <span className="font-mono text-foreground">{totp.secret}</span></p>
              </div>
            )}
            <Input autoFocus inputMode="numeric" maxLength={6} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" value={totpCode} />
            <DialogFooter>
              <Button onClick={() => void cancelTotp()} type="button" variant="ghost">Cancel</Button>
              <Button disabled={totpCode.length !== 6 || workingFactor === "totp-verify"} type="submit" variant="secondary">{workingFactor === "totp-verify" ? "Checking…" : "Turn on"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setPhoneDialogOpen} open={phoneDialogOpen}>
        <DialogContent className="max-w-md">
          {phoneEnrollment ? (
            <form className="grid gap-4" onSubmit={confirmPhone}>
              <DialogHeader>
                <DialogTitle>Enter the code we texted</DialogTitle>
                <DialogDescription>Sent to {phoneEnrollment.phone}.</DialogDescription>
              </DialogHeader>
              <Input autoFocus inputMode="numeric" maxLength={8} onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" value={phoneCode} />
              <DialogFooter>
                <Button onClick={() => setPhoneDialogOpen(false)} type="button" variant="ghost">Cancel</Button>
                <Button disabled={phoneCode.length < 6 || workingFactor === "phone-verify"} type="submit" variant="secondary">{workingFactor === "phone-verify" ? "Checking…" : "Turn on"}</Button>
              </DialogFooter>
            </form>
          ) : (
            <form className="grid gap-4" onSubmit={startPhone}>
              <DialogHeader>
                <DialogTitle>Text-message codes</DialogTitle>
                <DialogDescription>We'll text a code to this number each time you sign in.</DialogDescription>
              </DialogHeader>
              <Input autoFocus inputMode="tel" onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+1 555 123 4567" type="tel" value={phoneNumber} />
              <DialogFooter>
                <Button onClick={() => setPhoneDialogOpen(false)} type="button" variant="ghost">Cancel</Button>
                <Button disabled={phoneNumber.trim().length < 8 || workingFactor === "phone"} type="submit" variant="secondary">{workingFactor === "phone" ? "Sending…" : "Send code"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
