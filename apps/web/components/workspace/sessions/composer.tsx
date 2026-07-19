"use client";

// Composer — desktop src/app/chat/composer/index.tsx (shell spec §B7), v1:
// contenteditable input, model pill (Instant/Medium/High — cosmetic in v1,
// every mode sends deepseek-chat), a "+" menu with one disabled attachments
// row, send/stop circle. No voice, no queueing, no popover trigger, no drag
// popout — not in the C1 scope.

import type { KeyboardEvent } from "react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { ChevronDown } from "@/lib/workspace/icons";
import { Mic } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

export type AnswerMode = "instant" | "medium" | "high";

const ANSWER_MODE_STORAGE_KEY = "nemesis.web.answer-mode";
const ANSWER_MODE_LABEL: Record<AnswerMode, string> = { high: "High", instant: "Instant", medium: "Medium" };
const ANSWER_MODES: AnswerMode[] = ["instant", "medium", "high"];

function isAnswerMode(value: string | null): value is AnswerMode {
  return value === "instant" || value === "medium" || value === "high";
}

function readStoredAnswerMode(): AnswerMode {
  if (typeof window === "undefined") return "instant";
  const stored = window.localStorage.getItem(ANSWER_MODE_STORAGE_KEY);
  return isAnswerMode(stored) ? stored : "instant";
}

interface ComposerProps {
  busy: boolean;
  centered?: boolean;
  placeholder: string;
  onSubmit: (text: string, files: File[]) => void;
  onStop: () => void;
}

export function Composer({ busy, centered = false, placeholder, onSubmit, onStop }: ComposerProps) {
  const inputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasText, setHasText] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [listening, setListening] = useState(false);
  const [answerMode, setAnswerMode] = useState<AnswerMode>(readStoredAnswerMode);

  const setMode = (mode: AnswerMode) => {
    setAnswerMode(mode);
    try {
      window.localStorage.setItem(ANSWER_MODE_STORAGE_KEY, mode);
    } catch {
      // best-effort
    }
  };

  const submit = useCallback(() => {
    const el = inputRef.current;
    if (!el || busy) return;
    const text = (el.textContent ?? "").trim();
    if (!text && files.length === 0) return;
    el.textContent = "";
    setHasText(false);
    const submittedFiles = files;
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onSubmit(text, submittedFiles);
  }, [busy, files, onSubmit]);

  const startDictation = () => {
    type SpeechRecognitionConstructor = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      stop: () => void;
      onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
    };
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (!transcript || !inputRef.current) return;
      const current = inputRef.current.textContent?.trim() ?? "";
      inputRef.current.textContent = [current, transcript].filter(Boolean).join(" ");
      setHasText(true);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={cn(
        "group/composer absolute left-1/2 z-30 w-[min(var(--composer-width),calc(100%-2rem))] max-w-full -translate-x-1/2 overflow-visible rounded-[1.75rem] pt-2 pb-[var(--composer-shell-pad-block-end)]",
        centered ? "top-1/2 -translate-y-1/2" : "bottom-0",
      )}
      data-slot="composer-root"
    >
      <div className="relative w-full rounded-[inherit]">
        <div
          className="group/composer-surface relative z-4 isolate grid grid-rows-[auto_1fr] overflow-hidden rounded-[inherit] border border-[color-mix(in_srgb,var(--dt-composer-ring)_calc(18%*var(--composer-ring-strength)),var(--dt-input))]"
          data-slot="composer-surface"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-(--composer-fill) backdrop-blur-[0.75rem] backdrop-saturate-[1.12]"
          />
          <div
            className="relative z-1 flex min-h-0 w-full flex-col gap-1.5 overflow-hidden rounded-[inherit] px-(--composer-surface-pad-x) py-(--composer-surface-pad-y)"
            data-slot="composer-fade"
          >
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1 px-1">
                {files.map((file, index) => (
                  <span className="flex max-w-44 items-center gap-1 rounded-full bg-(--ui-bg-quaternary) px-2 py-1 text-[0.6875rem] text-(--ui-text-secondary)" key={`${file.name}:${file.lastModified}:${index}`}>
                    <span className="truncate">{file.name}</span>
                    <button aria-label={`Remove ${file.name}`} className="rounded-full p-0.5 hover:bg-(--chrome-action-hover)" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button"><Codicon name="close" size="0.65rem" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-(--composer-control-gap) [grid-template-areas:'menu_input_controls']">
              <div className="flex translate-y-[3px] items-start self-start [grid-area:menu]">
                <input className="sr-only" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} ref={fileInputRef} type="file" />
                <AttachMenu onChoose={() => fileInputRef.current?.click()} />
              </div>
              <div className="min-w-0 [grid-area:input]">
                <div
                  aria-multiline="true"
                  className="min-h-(--composer-input-min-height) max-h-(--composer-input-max-height) min-w-(--composer-input-inline-min-width) flex-1 cursor-text overflow-y-auto whitespace-pre-wrap break-words bg-transparent pb-1 pr-1 pt-1 leading-normal text-foreground outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60"
                  contentEditable
                  data-placeholder={placeholder}
                  data-slot="composer-rich-input"
                  onInput={(event) => setHasText((event.currentTarget.textContent ?? "").trim().length > 0)}
                  onKeyDown={handleKeyDown}
                  ref={inputRef}
                  role="textbox"
                />
              </div>
              <div className="flex items-center justify-end [grid-area:controls]">
                <div className="ml-auto flex shrink-0 items-center gap-(--composer-control-gap)">
                  <ModelPill mode={answerMode} onChange={setMode} />
                  <Button aria-label="Dictate" aria-pressed={listening} className={cn("size-(--composer-control-size) rounded-full", listening && "bg-(--ui-control-active-background) text-foreground")} onClick={startDictation} size="icon" variant="ghost"><Mic size={15} /></Button>
                  {busy ? (
                    <Button
                      aria-label="Stop"
                      className="size-(--composer-control-primary-size) shrink-0 rounded-full bg-foreground p-0 text-background hover:bg-foreground/90"
                      onClick={onStop}
                      size="icon"
                    >
                      <span className="block size-2.5 rounded-[0.1875rem] bg-current" />
                    </Button>
                  ) : (
                    <Button
                      aria-label="Send"
                      className="size-(--composer-control-primary-size) shrink-0 rounded-full bg-foreground p-0 text-background hover:bg-foreground/90 disabled:bg-foreground/30 disabled:text-background disabled:opacity-100"
                      disabled={!hasText && files.length === 0}
                      onClick={submit}
                      size="icon"
                    >
                      <Codicon name="arrow-up" size="0.875rem" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttachMenu({ onChoose }: { onChoose: () => void }) {
  return (
    <Button aria-label="Attach files or images" className="size-(--composer-control-size) shrink-0 rounded-full text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground" onClick={onChoose} size="icon" type="button" variant="ghost">
      <Codicon name="add" size="1rem" />
    </Button>
  );
}

function ModelPill({ mode, onChange }: { mode: AnswerMode; onChange: (mode: AnswerMode) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-(--composer-control-size) max-w-40 shrink-0 gap-1 rounded-md px-2 text-xs font-normal text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground"
          size="sm"
          variant="ghost"
        >
          <span className="truncate">{ANSWER_MODE_LABEL[mode]}</span>
          <ChevronDown className="size-2.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-32 p-1" side="top">
        <div className="flex flex-col gap-0.5">
          {ANSWER_MODES.map((option) => (
            <DropdownMenuItem
              className={cn(
                "rounded-md px-2.5 py-1.5 text-left text-sm font-medium",
                option === mode ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
              )}
              key={option}
              onSelect={() => onChange(option)}
            >
              {ANSWER_MODE_LABEL[option]}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
