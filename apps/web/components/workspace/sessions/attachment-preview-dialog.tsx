"use client";

// Click an attachment in the transcript, see the document (owner 2026-08-04:
// "user should be able to click on the attachment for a popup preview").
//
// What can be shown depends on what was stored:
//   image  → the stored picture.
//   pdf    → the browser's own PDF viewer in a frame — pages, zoom, search.
//   docx/pptx → no browser renders these; the stored original is offered as a
//            download, with the honest note that its TEXT is what the model read.
//   nothing stored (older messages, files over the 50 MB ceiling) → say so
//            plainly rather than showing a broken frame.
//
// URLs are re-signed on every open: the year-long URL saved on the message is
// only a fallback, and a fresh hour-long one never expires mid-view.

import { useEffect, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";
import { supabase } from "@/lib/supabase";
import { attachmentBucket } from "@/lib/workspace/chat-attachments";
import type { SessionAttachment } from "@/lib/workspace/sessions-store";

export function AttachmentPreviewDialog({ attachment, onClose }: { attachment: SessionAttachment | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!attachment) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    if (!attachment.storagePath) {
      setUrl(attachment.url ?? null);
      return;
    }
    setResolving(true);
    void supabase.storage
      .from(attachmentBucket(attachment))
      .createSignedUrl(attachment.storagePath, 3600)
      .then(({ data }) => {
        if (cancelled) return;
        setUrl(data?.signedUrl ?? attachment.url ?? null);
        setResolving(false);
      })
      .catch(() => {
        if (cancelled) return;
        setUrl(attachment.url ?? null);
        setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment]);

  if (!attachment) return null;

  const isImage = attachment.mime?.startsWith("image/") ?? false;
  const isPdf = attachment.mime === "application/pdf" || attachment.name.toLowerCase().endsWith(".pdf");
  const frameable = url !== null && (isImage || isPdf);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{attachment.name}</DialogTitle>
          <DialogDescription className="sr-only">Preview of the attached file.</DialogDescription>
        </DialogHeader>
        {resolving ? (
          <div className="grid h-64 place-items-center text-xs text-(--ui-text-tertiary)">Opening…</div>
        ) : frameable && isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- private signed URL, host is deployment-specific.
          <img alt={attachment.name} className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg object-contain" src={url} />
        ) : frameable && isPdf ? (
          <iframe className="h-[70vh] w-full rounded-lg border border-(--ui-stroke-tertiary) bg-background" src={url} title={attachment.name} />
        ) : url ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-6 py-10 text-center">
            <Codicon className="text-(--ui-text-tertiary)" name="file" size="1.5rem" />
            <p className="text-sm">This file type has no inline preview, but the original is saved.</p>
            <p className="max-w-sm text-xs text-(--ui-text-tertiary)">Its full text was read into the conversation, so the answers already account for it.</p>
            <Button onClick={() => window.open(url, "_blank", "noopener,noreferrer")} size="sm" variant="secondary">
              <Codicon name="cloud-download" size="0.85rem" /> Download original
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-6 py-10 text-center">
            <Codicon className="text-(--ui-text-tertiary)" name="file" size="1.5rem" />
            <p className="text-sm">The original file wasn&rsquo;t stored.</p>
            <p className="max-w-sm text-xs text-(--ui-text-tertiary)">
              Its text was read into the conversation when it was attached. Files sent from today onward keep their original for preview (up to 50 MB).
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
