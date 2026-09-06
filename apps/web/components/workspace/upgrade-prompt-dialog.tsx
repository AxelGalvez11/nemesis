"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { canonicalPlan } from "@nemesis/shared";
import { fetchEntitlements } from "@/lib/api";

import { Button } from "@/components/desktop-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import {
  dismissUpgradePrompt,
  nextDailyReset,
  showUpgradePrompt,
  subscribeUpgradePrompt,
  upgradePromptServerSnapshot,
  upgradePromptSnapshot,
} from "@/lib/workspace/upgrade-prompt";

/**
 * Shell-mounted "out of credits" popup. The transport layer opens it via
 * showUpgradePrompt() whenever the valve reports a budget-exhausted turn, so
 * every chat surface (Sessions, notebooks, live audio) gets the same upsell
 * without wiring it per-surface. Renders nothing while closed.
 */
export function UpgradePromptDialog() {
  const state = useSyncExternalStore(subscribeUpgradePrompt, upgradePromptSnapshot, upgradePromptServerSnapshot);
  const preview = useWorkspacePreview();

  // 🔴 A PAYING SUBSCRIBER WAS BEING SOLD NEMESIS. The dialog fires on any exhausted allowance,
  // and its only button went to /pricing regardless of plan, so someone already on Nemesis who
  // hit the daily cap was told to "Get Nemesis". Look up the plan when the dialog opens (one RPC,
  // only then) and drop the upsell for anyone who is not on the free plan.
  const [paid, setPaid] = useState<boolean | null>(null);
  useEffect(() => {
    if (!state.open) return;
    let alive = true;
    fetchEntitlements()
      .then((snapshot) => { if (alive) setPaid(canonicalPlan(snapshot.plan) !== "free"); })
      .catch(() => { if (alive) setPaid(false); });
    return () => { alive = false; };
  }, [state.open]);

  // Dev-preview harness hook: lets the screenshot tooling open the dialog
  // without burning a real daily budget. Only registered on the seeded
  // /dev-preview surfaces (preview context present), never in the real app.
  useEffect(() => {
    if (!preview || typeof window === "undefined") return;
    const w = window as Window & { __nemesisPreviewShowUpgrade?: (message?: string) => void };
    w.__nemesisPreviewShowUpgrade = showUpgradePrompt;
    return () => {
      delete w.__nemesisPreviewShowUpgrade;
    };
  }, [preview]);

  return (
    <Dialog onOpenChange={(open) => { if (!open) dismissUpgradePrompt(); }} open={state.open}>
      <DialogContent className="max-w-[26rem]" fitContent>
        <DialogHeader>
          {/* 🔴 NOT "you're out of credits". Nemesis is not a credit meter and
              must never read like one (owner, 2026-08-18): a student should not
              be told a balance, only that this month is used up and when it
              comes back. */}
          <DialogTitle>That&rsquo;s everything for now</DialogTitle>
          <DialogDescription>
            {friendlyLimitMessage(state.message, state.reset)}
          </DialogDescription>
        </DialogHeader>
        <p className="px-1 text-sm leading-relaxed text-muted-foreground">
          {state.reset === "monthly"
            ? "Your monthly allowance resets on the 1st."
            : `It comes back at ${nextDailyReset(new Date()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`}{" "}
          {paid
            ? "Your work stays put, and everything picks up again then."
            : "Nemesis gives you room for a full course load if you want to keep going now. Your work stays put either way."}
        </p>
        <DialogFooter>
          <Button onClick={dismissUpgradePrompt} variant="secondary">{paid ? "Okay" : "Wait for reset"}</Button>
          {paid ? null : (
            <Button asChild onClick={dismissUpgradePrompt}>
              <Link href="/pricing">Get Nemesis</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The valve's own line is developer prose ("Daily token budget reached for the enterprise plan.
 * Upgrade or try again tomorrow."): it names the raw plan code, calls the allowance a "token
 * budget" (banned wording, see above) and pitches an upgrade at everyone. Whenever the server's
 * message is one of those stock lines, say it our way; anything else is passed through, because
 * a specific reason (a search cap, say) is worth more than a generic one.
 */
export function friendlyLimitMessage(message: string | null, reset: "daily" | "monthly" | null): string {
  const stock = !message || /token budget|budget reached|budget exhausted/i.test(message);
  if (!stock) return message;
  return reset === "monthly"
    ? "You've used what your plan gives you this month."
    : "You've used what your plan gives you for today.";
}
