"use client";

// User bubble — ordinary document-flow message with an inline edit action.
// It intentionally never becomes sticky: long conversations must scroll as a
// single transcript and never hide assistant content behind a pinned prompt.

import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { splitAttachmentSummary } from "@/lib/workspace/chat-attachments";
import type { SessionAttachment, SessionMessage } from "@/lib/workspace/sessions-store";
import { cn } from "@/lib/utils";

const USER_BUBBLE_BASE_CLASS =
  "composer-human-message relative flex w-fit min-w-0 max-w-[85%] self-end flex-col gap-1.5 overflow-y-auto rounded-[1.75rem] border bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)] px-4 py-2.5 text-left";
const USER_BUBBLE_READ_CLASS =
  "cursor-default text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground/95 transition-colors border-(--ui-stroke-tertiary) hover:border-(--ui-stroke-secondary)";

/** What kind of thing this is, from its name alone — the File object is long
 *  gone by the time a transcript is re-rendered from storage. */
function attachmentKind(name: string): { label: string; icon: string } {
  if (name.endsWith("/")) return { icon: "folder", label: "Folder" };
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "heic", "heif"].includes(extension)) return { icon: "file-media", label: "Image" };
  if (extension === "pdf") return { icon: "file-pdf", label: "PDF" };
  if (["pptx", "ppt"].includes(extension)) return { icon: "preview", label: "Slides" };
  if (["docx", "doc"].includes(extension)) return { icon: "file", label: "Document" };
  if (["apkg", "colpkg"].includes(extension)) return { icon: "library", label: "Anki deck" };
  if (["md", "mdx", "txt"].includes(extension)) return { icon: "file", label: "Note" };
  return { icon: "file", label: extension ? extension.toUpperCase() : "File" };
}

/** Attachments as cards rather than a line of prose (owner 2026-07-27). */
function AttachmentCards({ names, records }: { names: string[]; records: SessionAttachment[] }) {
  const byName = new Map(records.map((attachment) => [attachment.name, attachment]));
  const items = names.length ? names : records.map((attachment) => attachment.name);
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {items.map((name) => {
        const record = byName.get(name);
        const kind = attachmentKind(name);
        if (record?.kind === "image" && record.url) {
          return (
            <figure className="max-w-sm overflow-hidden rounded-2xl border border-(--ui-stroke-tertiary) bg-background" key={name}>
              {/* A private signed URL is intentionally rendered directly; the
                  storage hostname is deployment-specific and cannot be listed
                  statically in next/image config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={name} className="max-h-80 w-auto max-w-full object-contain" src={record.url} />
              <figcaption className="truncate px-3 py-2 text-[0.6875rem] text-(--ui-text-tertiary)">{name}</figcaption>
            </figure>
          );
        }
        return (
          <div
            className="flex min-w-0 max-w-64 items-center gap-2 rounded-xl border border-(--ui-stroke-tertiary) bg-background px-2.5 py-1.5 text-left"
            key={name}
            title={name}
          >
            <Codicon className="shrink-0 text-(--ui-text-tertiary)" name={kind.icon} size="0.9rem" />
            <div className="min-w-0">
              <p className="truncate text-[0.75rem] leading-tight">{name.replace(/\/$/, "")}</p>
              <p className="text-[0.625rem] leading-tight text-(--ui-text-quaternary)">{kind.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UserMessage({ message, onEdit }: { message: SessionMessage; onEdit: (at: string, content: string) => void }) {
  const { attachments, body } = splitAttachmentSummary(message.content);
  const attachmentRecords = message.attachments ?? [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  return (
    <div
      className="group/user-message flex w-full min-w-0 flex-col items-stretch gap-0 self-end overflow-visible pb-(--conversation-turn-gap) pt-1"
      data-message-id={message.at}
      data-role="user"
      data-slot="aui_user-message-root"
    >
      {editing ? (
        <div className="ml-auto w-full max-w-[85%] rounded-[1.75rem] border border-(--ui-stroke-secondary) bg-background p-3 shadow-sm">
          <textarea autoFocus className="min-h-24 w-full resize-y bg-transparent text-[length:var(--conversation-text-font-size)] leading-relaxed outline-none" onChange={(event) => setDraft(event.target.value)} value={draft} />
          <div className="mt-2 flex justify-end gap-1.5">
            <Button onClick={() => { setDraft(message.content); setEditing(false); }} size="xs" variant="ghost">Cancel</Button>
            <Button disabled={!draft.trim()} onClick={() => { onEdit(message.at, draft); setEditing(false); }} size="xs" variant="secondary">Save</Button>
          </div>
        </div>
      ) : (
        <>
          {(attachments.length > 0 || attachmentRecords.length > 0) && (
            <AttachmentCards names={attachments} records={attachmentRecords} />
          )}
          {body && (
            <div className={cn(USER_BUBBLE_BASE_CLASS, USER_BUBBLE_READ_CLASS, "text-center", (attachments.length > 0 || attachmentRecords.length > 0) && "mt-1.5")}>
              <div className="min-h-[1.25rem] w-full">{body}</div>
            </div>
          )}
          <Button className="ml-auto mt-1 h-5 gap-1 px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) opacity-0 transition-opacity group-hover/user-message:opacity-100 focus-visible:opacity-100" onClick={() => setEditing(true)} size="xs" variant="ghost"><Codicon name="edit" size="0.7rem" /> Edit</Button>
        </>
      )}
    </div>
  );
}
