"use client";

// "Report a problem". Replaces the mailto link that made the learner describe their page,
// their browser and the error by hand. We attach those for them.

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
import { Textarea } from "@/components/desktop-ui/textarea";
import { lastErrors } from "@/lib/last-error";

interface ReportProblemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function currentCanvasId(): string | null {
  if (typeof window === "undefined") return null;
  const fromPath = window.location.pathname.match(/^\/canvas\/([^/?#]+)/)?.[1];
  if (fromPath) return fromPath;
  return new URLSearchParams(window.location.search).get("c");
}

export function ReportProblemDialog({ open, onOpenChange }: ReportProblemDialogProps) {
  const { session } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setMessage("");
      setSentId(null);
      setError(null);
      setBusy(false);
    }
  }

  async function submit() {
    const token = session?.access_token;
    if (!token || !message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/support/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: message.trim(),
          path: window.location.pathname + window.location.search,
          userAgent: navigator.userAgent,
          lastError: lastErrors().join("\n") || null,
          canvasId: currentCanvasId(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (!res.ok || !data.id) throw new Error("report_failed");
      setSentId(data.id);
    } catch {
      setError("That did not send. Try again, or email support@enternemesis.com.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>
            We attach your account email, the page you are on and the last error so you do not have to.
          </DialogDescription>
        </DialogHeader>
        {sentId ? (
          <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-secondary)">
            Sent. Reference {sentId.slice(0, 8)}. We reply by email.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-[length:var(--conversation-caption-font-size)] font-medium" htmlFor="report-problem-message">
              What happened?
            </label>
            <Textarea
              autoCapitalize="sentences"
              autoCorrect="on"
              className="min-h-28"
              disabled={busy}
              id="report-problem-message"
              onChange={(event) => setMessage(event.target.value)}
              placeholder="What you were doing, and what you expected instead."
              spellCheck
              value={message}
            />
            {error ? (
              <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-danger,red)">{error}</p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          {sentId ? (
            <Button onClick={() => close(false)} size="sm">Done</Button>
          ) : (
            <>
              <Button disabled={busy} onClick={() => close(false)} size="sm" variant="ghost">Cancel</Button>
              <Button disabled={busy || !message.trim() || !session} onClick={() => void submit()} size="sm">
                {busy ? "Sending" : "Send"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
