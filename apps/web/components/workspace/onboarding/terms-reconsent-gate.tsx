"use client";

// Asks a signed-in user to agree to the current Terms and Privacy Policy when the version recorded
// on their account is older than the one we publish, or missing.
//
// 🔴 BEFORE 2026-09-05, BUMPING TOS_VERSION ASKED NOBODY ANYTHING. The version was stamped on new
// accounts at signup and read by nothing else, so a changed Terms was agreed to only by people who
// joined after the change. This is the other half: the app compares the account's stamp with the
// current version on every workspace load, and stands in the way once until the user agrees.
//
// The record goes where signup already puts it, `auth.users.user_metadata`, with
// `tos_recorded_via: "reconsent"` so the two kinds of agreement can be told apart later.
//
// It does not block preview mode (no real account) and it does not block while the session is
// still loading, because a dialog that flashes and vanishes reads as a bug.

import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
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
import { isPreviewMode } from "@/lib/env";
import { needsReconsent, TOS_VERSION } from "@/lib/legal";
import { supabase } from "@/lib/supabase";

export function TermsReconsentGate() {
  const { loading, session } = useAuth();
  const preview = useWorkspacePreview() !== null || isPreviewMode;
  const [agreedHere, setAgreedHere] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open =
    !preview && !loading && !agreedHere && Boolean(session) && needsReconsent(session?.user.user_metadata);

  if (!open) return null;

  const agree = async () => {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        tos_version: TOS_VERSION,
        tos_accepted_at: new Date().toISOString(),
        tos_recorded_via: "reconsent",
      },
    });
    setSaving(false);
    if (updateError) {
      setError("That did not save. Check your connection and try again.");
      return;
    }
    // The auth client also emits USER_UPDATED, which refreshes the session; this closes the dialog
    // without waiting for that round trip.
    setAgreedHere(true);
  };

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        banner={error}
        bannerTone="error"
      >
        <DialogHeader>
          <DialogTitle>We updated our Terms and Privacy Policy</DialogTitle>
          <DialogDescription>
            Please read the new versions before you continue. They now say which companies help
            produce your answers, how billing and refunds work, and that your content is never used
            to train AI models.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          <Link className="underline" href="/legal/terms" target="_blank" rel="noreferrer">
            Terms of Use
          </Link>
          {" and "}
          <Link className="underline" href="/legal/privacy" target="_blank" rel="noreferrer">
            Privacy Policy
          </Link>
          {", effective "}
          {TOS_VERSION}.
        </p>
        <DialogFooter>
          <Button type="button" onClick={agree} disabled={saving}>
            {saving ? "Saving" : "I agree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
