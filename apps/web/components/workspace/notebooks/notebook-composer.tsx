"use client";

// The rounded chat composer used both as the project-home central bar (`large`) and inside the chat
// view. Owns only its draft; the parent decides what submitting does (start a new chat vs. continue
// one). Enter sends, Shift+Enter newlines.

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { Mic } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

interface NotebookComposerProps {
  onSubmit: (text: string, files: File[]) => void;
  disabled?: boolean;
  working?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** The project-home bar is larger and roomier than the in-chat one. */
  large?: boolean;
}

export function NotebookComposer({
  onSubmit,
  disabled,
  working,
  placeholder = "Ask a question",
  autoFocus,
  large,
}: NotebookComposerProps) {
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [listening, setListening] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(() => {
    const text = draft.trim();
    if ((!text && files.length === 0) || disabled || working) return;
    setDraft("");
    const submittedFiles = files;
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    onSubmit(text, submittedFiles);
  }, [draft, disabled, files, working, onSubmit]);

  const startDictation = () => {
    type RecognitionConstructor = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
    };
    const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => setDraft((current) => [current.trim(), event.results[0]?.[0]?.transcript?.trim() ?? ""].filter(Boolean).join(" "));
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={cn("rounded-[1.75rem] border border-(--ui-stroke-tertiary) bg-background px-3 py-2 shadow-sm transition-colors focus-within:border-(--ui-stroke-secondary)", large && "px-4 py-3")}
    >
      {files.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1 px-1">{files.map((file, index) => <span className="flex max-w-44 items-center gap-1 rounded-full bg-(--ui-bg-quaternary) px-2 py-1 text-[0.6875rem] text-(--ui-text-secondary)" key={`${file.name}:${index}`}><span className="truncate">{file.name}</span><button aria-label={`Remove ${file.name}`} className="rounded-full p-0.5 hover:bg-(--chrome-action-hover)" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button"><Codicon name="close" size="0.65rem" /></button></span>)}</div>}
      <div className="flex items-end gap-2">
        <input className="sr-only" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} ref={fileRef} type="file" />
        <Button aria-label="Attach files or images" className="shrink-0 rounded-full" onClick={() => fileRef.current?.click()} size="icon-sm" type="button" variant="ghost"><Codicon name="add" size="1rem" /></Button>
        <textarea
          ref={ref}
          autoFocus={autoFocus}
          className={cn("flex-1 resize-none bg-transparent py-1 leading-relaxed text-foreground outline-none placeholder:text-(--ui-text-quaternary)", large ? "max-h-56 min-h-9 text-base" : "max-h-48 min-h-8 text-[0.95rem]")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          value={draft}
        />
        <Button aria-label="Dictate" aria-pressed={listening} className={cn("shrink-0 rounded-full", listening && "bg-(--ui-control-active-background)")} onClick={startDictation} size="icon-sm" type="button" variant="ghost"><Mic size={15} /></Button>
        <Button aria-label="Send" className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90" disabled={(!draft.trim() && files.length === 0) || disabled || working} onClick={submit} size="icon-sm" type="button"><Codicon name="arrow-up" size="0.9rem" /></Button>
      </div>
    </div>
  );
}
