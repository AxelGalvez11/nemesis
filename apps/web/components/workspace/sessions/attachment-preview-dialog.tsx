"use client";

// Click an attachment in the transcript, see the document (owner 2026-08-04:
// "user should be able to click on the attachment for a popup preview").
//
// This used to be an <iframe> pointed at the file's storage URL — which meant
// Chrome's own PDF viewer, its grey toolbar and its download button, sitting
// inside a Nemesis dialog. It now mounts the SAME reader the Library route
// uses, in its compact form: the browser's viewer never appears, PowerPoint and
// Word open instead of downloading, and selecting a passage can start a
// question about it.
//
// URLs are re-signed on every open: the year-long URL saved on the message is
// only a fallback, and a fresh hour-long one never expires mid-view.

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { DocumentReader } from "@/components/workspace/reader/document-reader";
import { readerKind, type ReaderSource } from "@/lib/reader/reader-source";
import { supabase } from "@/lib/supabase";
import { attachmentBucket } from "@/lib/workspace/chat-attachments";
import { seedChatIntent } from "@/lib/workspace/composer-seed";
import type { SessionAttachment } from "@/lib/workspace/sessions-store";

export function AttachmentPreviewDialog({ attachment, onClose }: { attachment: SessionAttachment | null; onClose: () => void }) {
  const router = useRouter();

  const source: ReaderSource | null = useMemo(() => {
    if (!attachment) return null;
    const storagePath = attachment.storagePath;
    const fallback = attachment.url ?? null;
    return {
      // A chat attachment is not a filed Library row, so it has no
      // library_sources id. Its storage path stands in as identity here;
      // nothing links to this dialog, so no citation depends on the value.
      id: storagePath ?? attachment.name,
      fileName: attachment.name,
      kind: readerKind(attachment.name, attachment.mime ?? null),
      mime: attachment.mime ?? null,
      sizeBytes: null,
      createdAt: null,
      folderPath: "",
      resolveUrl: async () => {
        if (!storagePath) return fallback;
        try {
          const { data } = await supabase.storage.from(attachmentBucket(attachment)).createSignedUrl(storagePath, 3600);
          return data?.signedUrl ?? fallback;
        } catch {
          return fallback;
        }
      },
    };
  }, [attachment]);

  const sendToChat = useCallback(
    (prompt: string, files: File[]) => {
      seedChatIntent({ files, prompt });
      onClose();
      router.push("/sessions");
    },
    [onClose, router],
  );

  if (!attachment || !source) return null;

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="flex h-[85vh] max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {/* The reader draws its own header — filename, controls, the lot — so
            the dialog's title is present for screen readers only. */}
        <DialogHeader className="sr-only">
          <DialogTitle>{attachment.name}</DialogTitle>
          <DialogDescription>The attached file, open in the Nemesis reader.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <DocumentReader onSendToChat={sendToChat} source={source} variant="dialog" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
