"use client";

// Composer — desktop src/app/chat/composer/index.tsx (shell spec §B7), v1:
// contenteditable input, attachment/deep-research menu, dictation, and
// send/stop/record controls.
//
// Mode vs effort (owner 2026-07-22): the pill next to the send button is the
// ANSWER EFFORT dial (Instant/Medium/High) — the thing a student changes often.
// Recording is a rarely-flipped mode, so it moved into the "+" menu and
// announces itself with a removable Record chip instead of occupying the pill.

import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { consumeSeededComposerFiles } from "@/lib/workspace/composer-seed";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import {
  CHAT_EFFORT_HINT,
  CHAT_EFFORT_LABEL,
  CHAT_EFFORTS,
  DEFAULT_CHAT_EFFORT,
  isChatEffort,
  type ChatEffort,
} from "@/lib/workspace/chat-effort";
import { ChevronDown } from "@/lib/workspace/icons";
import { Mic } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

export type ComposerMode = "chat" | "record";

const COMPOSER_MODE_STORAGE_KEY = "nemesis.web.composer-mode";
const COMPOSER_EFFORT_STORAGE_KEY = "nemesis.web.composer-effort";

function isComposerMode(value: string | null): value is ComposerMode {
  return value === "chat" || value === "record";
}

function readStoredComposerMode(): ComposerMode {
  if (typeof window === "undefined") return "chat";
  const stored = window.localStorage.getItem(COMPOSER_MODE_STORAGE_KEY);
  return isComposerMode(stored) ? stored : "chat";
}

function readStoredEffort(): ChatEffort {
  if (typeof window === "undefined") return DEFAULT_CHAT_EFFORT;
  const stored = window.localStorage.getItem(COMPOSER_EFFORT_STORAGE_KEY);
  return isChatEffort(stored) ? stored : DEFAULT_CHAT_EFFORT;
}

interface ComposerProps {
  busy: boolean;
  centered?: boolean;
  placement?: "floating" | "inline";
  placeholder: string;
  mode?: ComposerMode;
  onModeChange?: (mode: ComposerMode) => void;
  /** Told the stored level on mount, then on every change, so the sender can
   *  apply it to the turn. */
  onEffortChange?: (effort: ChatEffort) => void;
  onRecordingChange?: (recording: boolean) => void;
  onSubmit: (text: string, files: File[]) => void;
  onStop: () => void;
  showRecordCompanion?: boolean;
  /** Rendered under the pill, aligned to its left edge (the Projects chip). */
  belowStart?: ReactNode;
}

export function Composer({ busy, centered = false, placement = "floating", placeholder, mode, onModeChange, onEffortChange, onRecordingChange, onSubmit, onStop, showRecordCompanion = true, belowStart }: ComposerProps) {
  const inputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasText, setHasText] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("chat");
  const [effort, setEffortState] = useState<ChatEffort>(DEFAULT_CHAT_EFFORT);
  const activeMode = mode ?? composerMode;

  useEffect(() => {
    const stored = readStoredEffort();
    setEffortState(stored);
    onEffortChange?.(stored);
    // Read once on mount; the parent is told so its first turn uses it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEffort = (next: ChatEffort) => {
    setEffortState(next);
    onEffortChange?.(next);
    try { window.localStorage.setItem(COMPOSER_EFFORT_STORAGE_KEY, next); } catch { /* best-effort */ }
  };

  useEffect(() => {
    if (mode) return;
    const stored = readStoredComposerMode();
    setComposerMode(stored);
    onModeChange?.(stored);
    // The stored mode is read once when this composer is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // One-shot seed from "Attach to AI chat" (Library multi-select): the seeded
  // notes arrive as ordinary attachment chips on the freshly mounted composer.
  useEffect(() => {
    const seeded = consumeSeededComposerFiles();
    if (seeded && seeded.length > 0) setFiles((current) => [...current, ...seeded]);
  }, []);

  useEffect(() => {
    if (!mode) return;
    setComposerMode(mode);
    try { window.localStorage.setItem(COMPOSER_MODE_STORAGE_KEY, mode); } catch { /* best-effort */ }
  }, [mode]);

  const setMode = (mode: ComposerMode) => {
    if (recording && activeMode === "record" && mode === "chat") {
      setRecording(false);
      onRecordingChange?.(false);
      return;
    }
    setComposerMode(mode);
    onModeChange?.(mode);
    setRecording(false);
    onRecordingChange?.(false);
    try {
      window.localStorage.setItem(COMPOSER_MODE_STORAGE_KEY, mode);
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
        "group/composer z-30 max-w-full overflow-visible rounded-[1.75rem] pt-2 pb-[var(--composer-shell-pad-block-end)]",
        placement === "floating"
          ? "absolute left-1/2 w-[min(var(--composer-pill-max-width,42rem),calc(100%-2rem))] -translate-x-1/2"
          : "relative w-full",
        placement === "floating" && (centered ? "top-1/2 -translate-y-1/2" : "bottom-3"),
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
            {activeMode === "record" && (
              <div className="flex flex-wrap gap-1 px-1">
                <span className="flex items-center gap-1.5 rounded-full bg-(--ui-bg-quaternary) px-2.5 py-1 text-[0.6875rem] font-medium text-(--ui-text-secondary)" data-testid="record-chip">
                  <Codicon name="record" size="0.6rem" />
                  Record
                  <button
                    aria-label="Leave record mode"
                    className="rounded-full p-0.5 hover:bg-(--chrome-action-hover)"
                    onClick={() => setMode("chat")}
                    type="button"
                  >
                    <Codicon name="close" size="0.65rem" />
                  </button>
                </span>
              </div>
            )}
            {activeMode === "chat" && files.length > 0 && (
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
              <div className="flex items-center self-center [grid-area:menu]">
                {activeMode === "chat" && (
                  <>
                    <input className="sr-only" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} ref={fileInputRef} type="file" />
                    <AddMenu onChooseFiles={() => fileInputRef.current?.click()} onRecord={() => setMode("record")} />
                  </>
                )}
              </div>
              <div className="min-w-0 [grid-area:input]">
                {activeMode === "chat" ? (
                  <div
                    aria-multiline="true"
                    className="min-h-(--composer-input-min-height) max-h-(--composer-input-max-height) min-w-(--composer-input-inline-min-width) flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent py-1 pr-1 text-[1rem] leading-normal text-foreground outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60"
                    contentEditable
                    data-placeholder={placeholder}
                    data-slot="composer-rich-input"
                    onInput={(event) => setHasText((event.currentTarget.textContent ?? "").trim().length > 0)}
                    onKeyDown={handleKeyDown}
                    ref={inputRef}
                    role="textbox"
                  />
                ) : (
                  <AudioWaveform active={recording} />
                )}
              </div>
              <div className="flex items-center justify-end [grid-area:controls]">
                <div className="ml-auto flex shrink-0 items-center gap-(--composer-control-gap)">
                  {activeMode === "chat" && <EffortPill effort={effort} onChange={setEffort} />}
                  {activeMode === "chat" && <Button aria-label="Dictate" aria-pressed={listening} className={cn("size-(--composer-control-size) rounded-full", listening && "bg-(--ui-control-active-background) text-foreground")} onClick={startDictation} size="icon" variant="ghost"><Mic size={15} /></Button>}
                  {activeMode === "record" ? (
                    <Button
                      aria-label={recording ? "Stop recording" : "Start recording"}
                      aria-pressed={recording}
                      className={cn(
                        "size-(--composer-control-primary-size) shrink-0 rounded-full p-0",
                        recording ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background hover:bg-foreground/90",
                      )}
                      onClick={() => {
                        const next = !recording;
                        setRecording(next);
                        onRecordingChange?.(next);
                      }}
                      size="icon"
                    >
                      <Codicon name={recording ? "debug-stop" : "record"} size="0.875rem" />
                    </Button>
                  ) : busy ? (
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
      {activeMode === "chat" && belowStart && <div className="relative z-3 -mt-px flex justify-start pl-6">{belowStart}</div>}
      {activeMode === "record" && showRecordCompanion && <RecordCompanionPanel />}
    </div>
  );
}

function AudioWaveform({ active }: { active: boolean }) {
  return (
    <div aria-label={active ? "Recording audio waveform" : "Audio waveform ready"} className="flex h-(--composer-input-min-height) min-w-36 items-center justify-center gap-[3px]" role="img">
      {Array.from({ length: 18 }, (_, index) => (
        <span
          className={cn("w-[2px] rounded-full bg-foreground/65", active ? "animate-pulse" : "opacity-45")}
          key={index}
          style={{ animationDelay: `${(index % 6) * 85}ms`, animationDuration: `${620 + (index % 5) * 90}ms`, height: `${7 + ((index * 7) % 17)}px` }}
        />
      ))}
    </div>
  );
}

export function RecordCompanionPanel() {
  return (
    <section className="mt-2 grid min-h-28 grid-cols-2 divide-x divide-(--ui-stroke-tertiary) overflow-hidden rounded-[1.5rem] border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_92%,transparent)] shadow-lg backdrop-blur-xl animate-in slide-in-from-bottom-3 fade-in-0 duration-300 motion-reduce:animate-none" data-slot="record-companion-panel">
      <div className="p-4">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-secondary)">Transcript</h2>
        <p className="mt-2 text-xs leading-relaxed text-(--ui-text-quaternary)">Live transcription will appear here while you record.</p>
      </div>
      <div className="p-4">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-secondary)">Suggestion</h2>
        <p className="mt-2 text-xs leading-relaxed text-(--ui-text-quaternary)">Prompts such as what to say next or what to explore will appear here.</p>
      </div>
    </section>
  );
}

function AddMenu({ onChooseFiles, onRecord }: { onChooseFiles: () => void; onRecord: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Add to chat" className="size-(--composer-control-size) shrink-0 rounded-full text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground" size="icon" type="button" variant="ghost">
          <Codicon name="add" size="1rem" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44" side="top" sideOffset={8}>
        <DropdownMenuItem onSelect={onChooseFiles}>
          <Codicon name="file-media" size="0.875rem" />
          Files
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Codicon name="search" size="0.875rem" />
          Deep research
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="add-menu-record" onSelect={onRecord}>
          <Codicon name="record" size="0.875rem" />
          Record
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EffortPill({ effort, onChange }: { effort: ChatEffort; onChange: (effort: ChatEffort) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Answer effort: ${CHAT_EFFORT_LABEL[effort]}`}
          className="h-(--composer-control-size) max-w-40 shrink-0 gap-1 rounded-md px-2 text-xs font-normal text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground"
          data-testid="effort-pill"
          size="sm"
          variant="ghost"
        >
          <span className="truncate">{CHAT_EFFORT_LABEL[effort]}</span>
          <ChevronDown className="size-2.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 p-1" side="top">
        <div className="flex flex-col gap-0.5">
          {CHAT_EFFORTS.map((option) => (
            <DropdownMenuItem
              className={cn(
                "flex-col items-start gap-0 rounded-md px-2.5 py-1.5 text-left",
                option === effort ? "bg-(--ui-control-active-background) text-foreground" : "text-foreground hover:bg-(--ui-control-hover-background)",
              )}
              key={option}
              onSelect={() => onChange(option)}
            >
              <span className="text-sm font-medium">{CHAT_EFFORT_LABEL[option]}</span>
              <span className="text-[0.6875rem] font-normal text-(--ui-text-tertiary)">{CHAT_EFFORT_HINT[option]}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
