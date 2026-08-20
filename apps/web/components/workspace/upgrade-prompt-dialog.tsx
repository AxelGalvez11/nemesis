"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

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
            {state.message ?? "You've used what your plan gives you for today."}
          </DialogDescription>
        </DialogHeader>
        <p className="px-1 text-sm leading-relaxed text-muted-foreground">
          {state.reset === "monthly"
            ? "Your monthly allowance resets on the 1st."
            : `It comes back at ${nextDailyReset(new Date()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`}{" "}
          Nemesis gives you room for a full course load if you want to keep going now. Your work stays put either way.
        </p>
        <DialogFooter>
          <Button onClick={dismissUpgradePrompt} variant="secondary">Wait for reset</Button>
          <Button asChild onClick={dismissUpgradePrompt}>
            <Link href="/pricing">Get Nemesis</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
