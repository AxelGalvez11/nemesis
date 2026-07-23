"use client";

// Composer — desktop src/app/chat/composer/index.tsx (shell spec §B7), v1:
// contenteditable input, attachment/deep-research menu, dictation, and
// send/stop/record controls.
//
// Mode vs effort (owner 2026-07-22): the pill next to the send button is the
// ANSWER EFFORT dial (Instant/Medium/High) — the thing a student changes often.
//
// RECORD MODE (owner 2026-07-22, second pass). Recording is no longer buried in
// the "+" menu and no longer takes the composer away:
//   - the primary button is the way IN when there is nothing to send (waveform
//     icon), and the same button turns into an ✕ that is the way OUT;
//   - the field's slot becomes a live meter — nothing to type while recording;
//   - "+" becomes the record control (start, then stop) — it is what actually
//     drives the recorder, via onRecordingChange → RecordWorkspace's `active`;
//   - dictation is hidden, because a live microphone is already captured.
// The meter is real: levels come from the recorder's own AudioContext through
// lib/workspace/mic-level.ts, so nothing here opens a second microphone stream.
//
// The primary button is --theme-primary, the accent the student picked in
// Appearance settings (crimson by default, green/blue/orange/purple if chosen)
// — never a hardcoded color.

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
import { subscribeMicLevel } from "@/lib/workspace/mic-level";
import { ChevronDown } from "@/lib/workspace/icons";
import { Mic } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

import { LibraryPickerDialog } from "./library-picker-dialog";

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
  const [libraryOpen, setLibraryOpen] = useState(false);
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
                {activeMode === "chat" ? (
                  <>
                    {/* APPENDS, like the Library picker below. It used to
                        replace, which was harmless while it was the only way to
                        attach anything — now that "+" also opens the Library,
                        replacing would silently bin the notes just picked. The
                        input is cleared so re-choosing the same file still
                        fires a change event. */}
                    <input
                      className="sr-only"
                      multiple
                      onChange={(event) => {
                        const picked = Array.from(event.target.files ?? []);
                        if (picked.length > 0) setFiles((current) => [...current, ...picked]);
                        event.target.value = "";
                      }}
                      ref={fileInputRef}
                      type="file"
                    />
                    <AddMenu onChooseFiles={() => fileInputRef.current?.click()} onOpenLibrary={() => setLibraryOpen(true)} />
                  </>
                ) : (
                  // The "+" slot becomes the record control: this is the button
                  // that actually starts and stops capture (RecordWorkspace
                  // listens to onRecordingChange), not a decoration.
                  <Button
                    aria-label={recording ? "Stop recording" : "Start recording"}
                    aria-pressed={recording}
                    className={cn(
                      "size-(--composer-control-size) shrink-0 rounded-full",
                      recording
                        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        : "text-(--theme-primary) hover:bg-(--chrome-action-hover)",
                    )}
                    data-testid="composer-record-toggle"
                    onClick={() => {
                      const next = !recording;
                      setRecording(next);
                      onRecordingChange?.(next);
                    }}
                    size="icon"
                    type="button"
                    variant={recording ? "default" : "ghost"}
                  >
                    <Codicon name={recording ? "debug-stop" : "record"} size="1rem" />
                  </Button>
                )}
              </div>
              <div className="min-w-0 [grid-area:input]">
                {/* Record mode takes the field's slot for the meter (owner
                    2026-07-22) — there is nothing to type while recording, and
                    this keeps web identical to the phone's record row. */}
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
                  <EffortPill effort={effort} onChange={setEffort} />
                  {/* Dictation is hidden in record mode: a live microphone is
                      already being captured, so a second one is nonsense. */}
                  {activeMode === "chat" && <Button aria-label="Dictate" aria-pressed={listening} className={cn("size-(--composer-control-size) rounded-full", listening && "bg-(--ui-control-active-background) text-foreground")} onClick={startDictation} size="icon" variant="ghost"><Mic size={15} /></Button>}
                  {activeMode === "record" ? (
                    // The waveform button turned into this ✕ — the way out.
                    // Mid-capture, setMode's guard turns the press into a stop
                    // first rather than binning an unsaved transcript; the mode
                    // then closes on its own when RecordWorkspace has saved and
                    // fired onFinished. Either way this button means "leave",
                    // which is why it says so — "+" is the stop control.
                    <Button
                      aria-label="Leave record mode"
                      className="size-(--composer-control-primary-size) shrink-0 rounded-full bg-(--theme-primary) p-0 text-white hover:opacity-90"
                      data-testid="composer-record-exit"
                      onClick={() => setMode("chat")}
                      size="icon"
                      type="button"
                    >
                      <Codicon name="close" size="0.875rem" />
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
                  ) : hasText || files.length > 0 ? (
                    <Button
                      aria-label="Send"
                      className="size-(--composer-control-primary-size) shrink-0 rounded-full bg-foreground p-0 text-background hover:bg-foreground/90"
                      onClick={submit}
                      size="icon"
                    >
                      <Codicon name="arrow-up" size="0.875rem" />
                    </Button>
                  ) : (
                    // Nothing to send, so the primary button is the way INTO
                    // record mode rather than a dead greyed-out Send.
                    <Button
                      aria-label="Record"
                      className="size-(--composer-control-primary-size) shrink-0 rounded-full bg-(--theme-primary) p-0 text-white hover:opacity-90"
                      data-testid="composer-record-enter"
                      onClick={() => setMode("record")}
                      size="icon"
                      type="button"
                    >
                      <WaveformMark />
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
      {/* Picked notes APPEND — the file input above replaces, but a Library
          choice is additive to whatever is already attached. */}
      <LibraryPickerDialog
        onAttach={(picked) => setFiles((current) => [...current, ...picked])}
        onOpenChange={setLibraryOpen}
        open={libraryOpen}
      />
    </div>
  );
}

/** The four-bar audio mark on the record button. Drawn here rather than pulled
 *  from the codicon set so it matches the meter above the field exactly. */
function WaveformMark() {
  return (
    <span aria-hidden className="flex h-3.5 items-center gap-[2px]">
      {[0.5, 1, 0.7, 0.35].map((scale, index) => (
        <span className="w-[2px] rounded-full bg-current" key={index} style={{ height: `${scale * 100}%` }} />
      ))}
    </span>
  );
}

const WAVEFORM_BAR_COUNT = 24;
/** Floor so a silent room still shows a thin line of bars rather than an empty
 *  gap, which reads as "broken" rather than "quiet". */
const WAVEFORM_MIN_SCALE = 0.12;

// The bars show the audio ACTUALLY coming in, replacing the canned pulse this
// drew before. Levels arrive from the recorder's own AudioContext via
// lib/workspace/mic-level.ts.
//
// It scrolls: each new reading enters at the right and every older one shifts a
// bar left, so the strip reads as the last couple of seconds rather than bars
// pulsing in unison. Heights are written straight to the DOM — no React state,
// so a live meter costs the chat around it exactly zero re-renders (same reason
// the mobile waveform drives Animated values imperatively).
function AudioWaveform({ active }: { active: boolean }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const historyRef = useRef<number[]>(Array.from({ length: WAVEFORM_BAR_COUNT }, () => WAVEFORM_MIN_SCALE));

  useEffect(() => {
    const paint = () => {
      for (let index = 0; index < barsRef.current.length; index += 1) {
        const bar = barsRef.current[index];
        if (bar) bar.style.transform = `scaleY(${historyRef.current[index]})`;
      }
    };
    if (!active) {
      historyRef.current = historyRef.current.map(() => WAVEFORM_MIN_SCALE);
      paint();
      return;
    }
    return subscribeMicLevel((level) => {
      historyRef.current = [
        ...historyRef.current.slice(1),
        WAVEFORM_MIN_SCALE + level * (1 - WAVEFORM_MIN_SCALE),
      ];
      paint();
    });
  }, [active]);

  return (
    <div
      aria-label={active ? "Recording audio waveform" : "Microphone idle"}
      className="flex h-(--composer-input-min-height) w-full items-center gap-[3px]"
      data-testid="composer-waveform"
      role="img"
    >
      {Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => (
        <span
          className={cn(
            "h-full max-w-1 flex-1 rounded-full bg-(--theme-primary) transition-transform duration-100 ease-out",
            active ? "opacity-100" : "opacity-40",
          )}
          key={index}
          ref={(node) => { barsRef.current[index] = node; }}
          style={{ transform: `scaleY(${WAVEFORM_MIN_SCALE})` }}
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

// Record is deliberately absent here (owner 2026-07-22): it lives on the
// primary button now, so the menu is attachments-only.
//
// "Library" (owner 2026-07-23) is the in-chat way into saved work now that the
// Notebooks page is retired. It opens a picker rather than a submenu because
// the choice is multi-select across a folder tree, which a dropdown cannot hold.
function AddMenu({ onChooseFiles, onOpenLibrary }: { onChooseFiles: () => void; onOpenLibrary: () => void }) {
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
        <DropdownMenuItem data-testid="composer-add-library" onSelect={onOpenLibrary}>
          <Codicon name="book" size="0.875rem" />
          Library
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Codicon name="search" size="0.875rem" />
          Deep research
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
