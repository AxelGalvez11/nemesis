"use client";

// Composer — desktop src/app/chat/composer/index.tsx (shell spec §B7), v1:
// contenteditable input, attachment/deep-research menu, dictation, and
// send/stop/record controls.
//
// ANSWER EFFORT IS NO LONGER A CONTROL (owner 2026-07-31). The Instant/Medium/
// High pill next to the send button is gone; every turn now runs at
// DEFAULT_CHAT_EFFORT. THE FEATURE STAYS — effort is still chosen, still sent,
// and session-chat/notebook-chat-view still read it through onEffortChange.
// Only the dial the student had to think about was taken away. The phone lost
// the same dial in #369, so the two surfaces agree again.
//
// RECORD MODE (owner 2026-07-22; controls reshaped 2026-08-03: "the composer
// in record mode should contain the 'start button' … the way to end recording
// is to click on the 'x'"). Recording is not buried in the "+" menu and does
// not take the composer away:
//   - the primary button is the way IN when there is nothing to send (waveform
//     icon), and the same button becomes the ✕ that ENDS the recording;
//   - the "+" slot is the capture control: Start, then Pause/Continue. It
//     drives the recorder via onRecordingChange → RecordWorkspace's `active`,
//     and pauses through onRecordingPauseToggle into the same hook;
//   - the field's slot is a quiet status line — the live waveform lives in the
//     recording panel ONLY (owner 2026-08-03: "it should not show the waveform
//     on the composer, only in the box");
//   - dictation is hidden, because a live microphone is already captured.
//
// The primary button is --theme-primary, the accent the student picked in
// Appearance settings (crimson by default, green/blue/orange/purple if chosen)
// — never a hardcoded color.

import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { consumeSeededComposerFiles } from "@/lib/workspace/composer-seed";
import { groupChatAttachments } from "@/lib/workspace/chat-attachments";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { DEFAULT_CHAT_EFFORT, type ChatEffort } from "@/lib/workspace/chat-effort";
import { publishMicLevel, resetMicLevel, subscribeMicLevel } from "@/lib/workspace/mic-level";
import { emptyWaveform, pushWaveBar } from "@/lib/workspace/waveform-history";
import { Mic } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

import { LibraryPickerDialog } from "./library-picker-dialog";
import { RecordingWaveform } from "./recording-waveform";

export type ComposerMode = "chat" | "record";

const COMPOSER_MODE_STORAGE_KEY = "nemesis.web.composer-mode";

function isComposerMode(value: string | null): value is ComposerMode {
  return value === "chat" || value === "record";
}

function readStoredComposerMode(): ComposerMode {
  if (typeof window === "undefined") return "chat";
  const stored = window.localStorage.getItem(COMPOSER_MODE_STORAGE_KEY);
  return isComposerMode(stored) ? stored : "chat";
}

interface ComposerProps {
  busy: boolean;
  centered?: boolean;
  placement?: "floating" | "inline";
  placeholder: string;
  mode?: ComposerMode;
  onModeChange?: (mode: ComposerMode) => void;
  /** Told the effort once on mount, so the sender can apply it to the turn.
   *  There is no longer anything that changes it — the dial was removed — but
   *  the channel stays open so effort remains a real, settable thing rather
   *  than a constant buried in the sender. */
  onEffortChange?: (effort: ChatEffort) => void;
  /** `discard` says WHY capture is ending: true means the student cancelled and
   *  the audio must be thrown away, false or absent means stop and write it up.
   *  Both arrive in one call so the recorder cannot act on half the decision. */
  onRecordingChange?: (recording: boolean, options?: { discard?: boolean }) => void;
  /** True while the student has paused capture. Lifted from the recorder so
   *  Pause/Continue can live here while the hook lives in the recording panel. */
  recordingPaused?: boolean;
  /** True while a finished recording is still uploading/transcribing. Start is
   *  disabled meanwhile — the recorder cannot begin a second capture until the
   *  write-up lands. */
  recordingBusy?: boolean;
  onRecordingPauseToggle?: () => void;
  onSubmit: (text: string, files: File[]) => void;
  onStop: () => void;
  showRecordCompanion?: boolean;
  /** Rendered under the pill, aligned to its left edge (the Projects chip). */
  belowStart?: ReactNode;
  /** Rendered under the pill, centered (the empty-chat suggestion chips). */
  belowCenter?: ReactNode;
}

export function Composer({ busy, centered = false, placement = "floating", placeholder, mode, onModeChange, onEffortChange, onRecordingChange, recordingPaused = false, recordingBusy = false, onRecordingPauseToggle, onSubmit, onStop, showRecordCompanion = true, belowStart, belowCenter }: ComposerProps) {
  const inputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasText, setHasText] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  /** ✕ pressed mid-capture. Ending is a fork — write it up, or bin it — and
   *  the standing rule is that anything destructive asks first, so the fork is
   *  a dialog rather than a guess. */
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("chat");
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Files dragged from Finder. A COUNTER, not a boolean: dragenter/dragleave
  // fire for every child the pointer crosses, so a boolean flickers off the
  // moment the cursor moves over the textbox inside the composer.
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const activeMode = mode ?? composerMode;
  const attachmentGroups = useMemo(() => groupChatAttachments(files), [files]);

  useEffect(() => {
    // The dial is gone, so there is one effort and the parent is told it once.
    // Deliberately NOT read back from localStorage any more: a student who had
    // set "High" before the pill was removed would otherwise be pinned to it
    // forever with nothing on screen to change it.
    onEffortChange?.(DEFAULT_CHAT_EFFORT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // 🔴 ✕ IS THE WAY TO END, BUT NEVER SILENTLY. It first saved outright —
      // which uploaded and filed the very recording the student was cancelling
      // (owner-reported 2026-07-31) — and then it only discarded. Now (owner
      // 2026-08-03: "the way to end recording is to click on the 'x'") it asks
      // which end this is: finish and write it up, or throw the audio away.
      setConfirmEnd(true);
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

  /** Confirmed finish: end capture and let the recorder write it up. Record
   *  mode deliberately STAYS open — the panel is showing upload/transcribe
   *  progress — and closes on its own when the parent hears onFinished.
   *  Flipping the mode here would unmount the panel mid-flight and lose the
   *  recording silently. */
  const finishRecording = () => {
    setConfirmEnd(false);
    setRecording(false);
    onRecordingChange?.(false);
  };

  /** Confirmed cancel: bin the audio AND leave record mode, in that order, so
   *  the recorder reads `discard` before it sees `active` go false. */
  const discardRecording = () => {
    setConfirmEnd(false);
    setRecording(false);
    onRecordingChange?.(false, { discard: true });
    setComposerMode("chat");
    onModeChange?.("chat");
    try {
      window.localStorage.setItem(COMPOSER_MODE_STORAGE_KEY, "chat");
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

  // The live objects dictation has to be able to tear down. Refs, not state:
  // none of them should redraw the composer when they change, and `listening`
  // is already the one piece of this the view cares about.
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const wantsDictationRef = useRef(false);
  const dictationBaseRef = useRef("");
  const dictationAudioRef = useRef<{ context: AudioContext; stream: MediaStream; timer: number } | null>(null);

  const closeDictationMeter = useCallback(() => {
    const audio = dictationAudioRef.current;
    dictationAudioRef.current = null;
    if (!audio) return;
    window.clearInterval(audio.timer);
    for (const track of audio.stream.getTracks()) track.stop();
    void audio.context.close().catch(() => undefined);
    // Without this the waveform keeps drawing the last reading for a microphone
    // that is already closed.
    resetMicLevel();
  }, []);

  const stopDictation = useCallback(() => {
    wantsDictationRef.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try { recognition.stop(); } catch { /* already stopped */ }
    }
    closeDictationMeter();
    setListening(false);
  }, [closeDictationMeter]);

  /** The microphone the waveform reads. Separate from the one the Web Speech
   *  API opens for itself, because that one is not reachable — see the note on
   *  startDictation. */
  const openDictationMeter = useCallback(async () => {
    if (dictationAudioRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop may have been pressed while the permission prompt was still up.
      if (!wantsDictationRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1_024;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let squares = 0;
        for (const sample of samples) squares += sample * sample;
        // Same RMS x 4 the recorder publishes, so one waveform can read either.
        publishMicLevel(Math.min(1, Math.sqrt(squares / Math.max(1, samples.length)) * 4));
      }, DICTATION_METER_MS);
      dictationAudioRef.current = { context, stream, timer };
    } catch {
      // No meter, but dictation itself still works: the Web Speech API holds its
      // own microphone permission and may well have it. Losing the waveform is
      // not a reason to stop transcribing.
    }
  }, []);

  // A composer unmounted mid-dictation would leave the microphone open and the
  // recogniser running with nowhere to put its words.
  useEffect(() => stopDictation, [stopDictation]);

  // ── Dictation ─────────────────────────────────────────────────────────────
  //
  // CONTINUOUS, AND METERED (owner 2026-07-29: "i need the dictation to also
  // have waveform animation for webapp"). This used to be one-shot: continuous
  // = false, interimResults = false, so it stopped after a single phrase and
  // nothing appeared until it did. A waveform on that would have flashed for two
  // seconds and vanished, which looks broken rather than alive — so the mode
  // itself changed with it. The mic button is now a toggle: press to start,
  // press again to stop.
  //
  // THE WAVEFORM NEEDS ITS OWN MICROPHONE, and that is worth stating plainly
  // because lib/workspace/mic-level.ts argues against exactly this. Its rule —
  // never open a second getUserMedia — protects the RECORDER, where a second
  // stream would meter audio that is not the audio being recorded. Dictation is
  // the case that rule does not cover: the Web Speech API owns its microphone
  // privately and exposes no stream, no node, and no level, so there is nothing
  // to read. This one is the only stream open at the time (the mic button is
  // hidden in record mode), and it feeds the same channel the recorder does, so
  // the waveform component stays unaware of which one is talking.
  const startDictation = () => {
    if (listening) {
      stopDictation();
      return;
    }
    type SpeechResult = { readonly isFinal?: boolean; readonly 0?: { transcript?: string } };
    type SpeechRecognitionConstructor = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      stop: () => void;
      onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
      onend: (() => void) | null;
      onerror: ((event: { error?: string }) => void) | null;
    };
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    wantsDictationRef.current = true;
    // Whatever was already typed. Each result rewrites the box from this plus
    // everything heard so far, so a corrected phrase replaces itself instead of
    // being appended twice.
    dictationBaseRef.current = inputRef.current?.textContent?.trim() ?? "";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let heard = "";
      for (let index = 0; index < event.results.length; index += 1) {
        heard += event.results[index]?.[0]?.transcript ?? "";
      }
      const element = inputRef.current;
      if (!element) return;
      const combined = [dictationBaseRef.current, heard.trim()].filter(Boolean).join(" ");
      element.textContent = combined;
      // Writing textContent collapses the caret to the start, so a student who
      // stops dictating and starts typing would type at the front of their own
      // sentence. Put it back at the end.
      const selection = window.getSelection();
      if (selection && element.lastChild) {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setHasText(combined.trim().length > 0);
    };

    // Chrome ends a continuous session on its own after a stretch of silence.
    // Restarting keeps "continuous" true in the sense the student means — it
    // runs until they press stop — rather than in the sense the API means.
    recognition.onend = () => {
      if (!wantsDictationRef.current) return;
      // The next session starts with an empty results list, so fold what has
      // been heard so far into the base or it is lost on the restart.
      dictationBaseRef.current = inputRef.current?.textContent?.trim() ?? dictationBaseRef.current;
      try {
        recognition.start();
      } catch {
        stopDictation();
      }
    };
    // 🔴 NOT every error is fatal, and treating them alike breaks the feature on
    // the first pause. Chrome fires `no-speech` whenever the student stops
    // talking for a couple of seconds — which is what thinking mid-sentence
    // looks like — and follows it with onend. Ending the session there would
    // kill dictation the moment anyone paused, silently, since stopDictation
    // clears wantsDictationRef and so suppresses onend's restart too.
    //
    // Only the errors that will still be true on the next attempt stop it.
    // Restarting through a refused permission or an absent microphone would spin
    // forever with nothing on screen explaining why; everything else falls
    // through to onend, which restarts.
    recognition.onerror = (event) => {
      if (TERMINAL_SPEECH_ERRORS.has(event?.error ?? "")) stopDictation();
    };

    setListening(true);
    recognition.start();
    void openDictationMeter();
  };

  /** Only a real file drag counts. Dragging selected TEXT, or a row from the
   *  Library/Study lists, also fires these events — and `types` is the one thing
   *  that tells them apart before the drop. */
  const carriesFiles = (transfer: DataTransfer | null): boolean =>
    Boolean(transfer && Array.from(transfer.types).includes("Files"));

  // Owner 2026-08-03, pointing at ChatGPT: "when dropping in a file, the whole
  // chat should indicate where to drop." So the drag is tracked on WINDOW, not
  // on the composer's own box — the moment a file enters the app, everywhere is
  // the target and one overlay says so. The depth counter survives from the old
  // element version: dragenter/dragleave fire for every boundary the pointer
  // crosses, so a boolean flickers off between elements.
  // 🔴 The window-level dragover+drop preventDefaults are what stop the browser
  // from NAVIGATING AWAY to a dropped file no matter where it lands — that job
  // used to belong to the composer element and now covers the whole page while
  // this composer is mounted. Only ONE Composer may be mounted at a time
  // (session-chat or the retired notebook view) or a single drop would attach
  // its files twice.
  useEffect(() => {
    if (activeMode !== "chat") return;
    const onWindowDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      dragDepth.current += 1;
      setDragOver(true);
    };
    const onWindowDragOver = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onWindowDragLeave = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragOver(false);
    };
    const onWindowDrop = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragOver(false);
      const dropped = Array.from(event.dataTransfer?.files ?? []);
      // Appended, never replaced — same rule the "+" picker follows, so a drop
      // cannot bin notes that were just attached from the Library.
      if (dropped.length > 0) setFiles((current) => [...current, ...dropped]);
    };
    window.addEventListener("dragenter", onWindowDragEnter);
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("dragleave", onWindowDragLeave);
    window.addEventListener("drop", onWindowDrop);
    return () => {
      window.removeEventListener("dragenter", onWindowDragEnter);
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("dragleave", onWindowDragLeave);
      window.removeEventListener("drop", onWindowDrop);
      dragDepth.current = 0;
      setDragOver(false);
    };
  }, [activeMode]);

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
      {/* The whole-app drop indicator (owner 2026-08-03, after two rounds of a
          small box above the composer kept confusing people: "the whole chat
          should indicate where to drop", pointing at ChatGPT's overlay).
          Purely visual — the WINDOW listeners above are the real drop surface,
          so pointer-events stays OFF and the overlay can never steal a drop or
          a click. Rendered through a portal to <body>:
          🔴 the floating composer root is CSS-TRANSFORMED (-translate-x-1/2),
          and a transformed ancestor hijacks position:fixed — as a child of the
          composer this overlay would pin to the composer pill, not the screen. */}
      {dragOver && activeMode === "chat" && typeof document !== "undefined" &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/45 p-6 backdrop-blur-[2px]"
            data-slot="composer-drop-target"
          >
            <div className="grid place-items-center justify-items-center gap-2 rounded-3xl border-2 border-dashed border-(--theme-primary) bg-(--ui-bg-elevated) px-12 py-9 shadow-2xl">
              <Codicon className="text-(--theme-primary)" name="cloud-upload" size="1.75rem" />
              <span className="text-lg font-semibold text-foreground">Add anything</span>
              <span className="text-sm text-(--ui-text-secondary)">Drop files here to add them to the conversation</span>
            </div>
          </div>,
          document.body,
        )}
      <div className="relative w-full rounded-[inherit]">
        {/* The composer surface itself stays clear while a file is over it, so
            the draft underneath remains readable. */}
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
                {attachmentGroups.map((group) => (
                  <span
                    className="flex max-w-44 items-center gap-1 rounded-full bg-(--ui-bg-quaternary) px-2 py-1 text-[0.6875rem] text-(--ui-text-secondary)"
                    key={group.key}
                    title={group.kind === "folder" ? `${group.label} folder` : group.label}
                  >
                    {group.kind === "folder" && <Codicon name="folder" size="0.75rem" />}
                    <span className="truncate">{group.label}</span>
                    <button
                      aria-label={`Remove ${group.label}`}
                      className="rounded-full p-0.5 hover:bg-(--chrome-action-hover)"
                      onClick={() => setFiles((current) => current.filter((file) => !group.files.includes(file)))}
                      type="button"
                    >
                      <Codicon name="close" size="0.65rem" />
                    </button>
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
                  // The "+" slot is the capture control (owner 2026-08-03):
                  // Start, and once live, Pause/Continue. Ending lives on the ✕
                  // — one way in, one way out. Starting drives the recorder via
                  // onRecordingChange → RecordWorkspace's `active`; pausing
                  // goes through onRecordingPauseToggle into the same hook.
                  <Button
                    aria-label={!recording ? "Start recording" : recordingPaused ? "Continue recording" : "Pause recording"}
                    aria-pressed={recording}
                    className={cn(
                      "h-(--composer-control-size) shrink-0 gap-1.5 rounded-full px-3.5 text-xs font-semibold",
                      recording && !recordingPaused
                        ? "bg-(--ui-control-active-background) text-foreground hover:bg-(--chrome-action-hover)"
                        : "bg-(--theme-primary) text-white hover:opacity-90",
                    )}
                    data-testid="composer-record-toggle"
                    disabled={recordingBusy}
                    onClick={() => {
                      if (!recording) {
                        setRecording(true);
                        onRecordingChange?.(true);
                        return;
                      }
                      onRecordingPauseToggle?.();
                    }}
                    type="button"
                    variant="ghost"
                  >
                    <Codicon name={!recording ? "record" : recordingPaused ? "play" : "debug-pause"} size="0.875rem" />
                    {!recording ? "Start" : recordingPaused ? "Continue" : "Pause"}
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
                    className="min-h-(--composer-input-min-height) max-h-(--composer-input-max-height) min-w-(--composer-input-inline-min-width) flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent py-1 pr-1 text-[length:var(--conversation-text-font-size)] leading-normal text-foreground outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60"
                    contentEditable
                    data-placeholder={placeholder}
                    data-slot="composer-rich-input"
                    onInput={(event) => setHasText((event.currentTarget.textContent ?? "").trim().length > 0)}
                    onKeyDown={handleKeyDown}
                    // 🔴 PLAIN TEXT ONLY. A contenteditable pastes HTML wholesale
                    // by default, so copying a message out of a chat — where the
                    // selection sweeps up attachment chips, citation pills, and
                    // artifact cards — pasted those COMPONENTS into the box
                    // (owner 2026-08-03: "copying a chat prompt from another
                    // chat also copies the component"). Pasted FILES (a
                    // screenshot, a copied PDF) become attachments instead,
                    // matching what dropping them does.
                    onPaste={(event) => {
                      event.preventDefault();
                      const pastedFiles = Array.from(event.clipboardData?.files ?? []);
                      if (pastedFiles.length > 0) {
                        setFiles((current) => [...current, ...pastedFiles]);
                        return;
                      }
                      const text = event.clipboardData?.getData("text/plain") ?? "";
                      // execCommand is the one insertion path that keeps the
                      // caret position and the undo stack in a contenteditable.
                      if (text) document.execCommand("insertText", false, text);
                      setHasText((event.currentTarget.textContent ?? "").trim().length > 0);
                    }}
                    ref={inputRef}
                    role="textbox"
                  />
                ) : (
                  // The live waveform lives in the recording panel ONLY (owner
                  // 2026-08-03: "it should not show the waveform on the
                  // composer, only in the box") — this slot just says where
                  // things stand.
                  <p className="flex min-h-(--composer-input-min-height) items-center gap-2 px-1 text-[0.8125rem] text-(--ui-text-tertiary)" data-slot="composer-record-status">
                    {recording && !recordingPaused && !recordingBusy && (
                      <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-(--theme-primary)" />
                    )}
                    {recordingBusy ? "Writing it up…" : recording ? (recordingPaused ? "Paused" : "Recording…") : "Ready to record"}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-end [grid-area:controls]">
                <div className="ml-auto flex shrink-0 items-center gap-(--composer-control-gap)">
                  {/* Dictation is hidden in record mode: a live microphone is
                      already being captured, so a second one is nonsense. */}
                  {/* Only while dictating, and only wide enough to read as
                      movement — the text going into the box is the real
                      feedback; this says the microphone is hearing you at all,
                      which is the thing a silent box cannot tell you. */}
                  {activeMode === "chat" && listening && (
                    <AudioWaveform active className="h-6 w-20 shrink-0" label="Dictation audio waveform" />
                  )}
                  {activeMode === "chat" && <Button aria-label={listening ? "Stop dictating" : "Dictate"} aria-pressed={listening} className={cn("size-(--composer-control-size) rounded-full", listening && "bg-(--ui-control-active-background) text-foreground")} onClick={startDictation} size="icon" variant="ghost"><Mic size={13} /></Button>}
                  {activeMode === "record" ? (
                    // The waveform button turned into this ✕ — the way OUT and
                    // the way to END (owner 2026-08-03). Mid-capture, setMode's
                    // guard turns the press into the end dialog — finish or
                    // discard, chosen out loud, never silently either. With no
                    // capture live it just leaves record mode.
                    <Button
                      aria-label={recording ? "End recording" : "Leave record mode"}
                      className="size-(--composer-control-primary-size) shrink-0 rounded-full bg-(--theme-primary) p-0 text-white hover:opacity-90"
                      data-testid="composer-record-exit"
                      onClick={() => setMode("chat")}
                      size="icon"
                      type="button"
                    >
                      <Codicon name="close" size="0.7rem" />
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
                      <Codicon name="arrow-up" size="0.7rem" />
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
      {activeMode === "chat" && belowCenter && <div className="relative z-3 mt-3 flex justify-center">{belowCenter}</div>}
      {activeMode === "record" && showRecordCompanion && <RecordCompanionPanel />}
      {/* ✕ pressed mid-capture. Sits directly above the composer, in the
          student's way, matching the chat's own delete confirmation. Ending is
          a fork — write it up, or bin it — and neither happens on its own (the
          2026-07-31 lesson: an ✕ that saved silently filed the recording the
          student was cancelling). Discard is the only red control. */}
      {confirmEnd && (
        <div
          className="absolute inset-x-0 bottom-full z-40 mx-auto mb-3 w-full max-w-md rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-4 shadow-lg"
          data-testid="composer-end-recording"
          role="alertdialog"
        >
          <p className="text-sm font-semibold text-(--ui-text-primary)">End this recording?</p>
          <p className="mt-1 text-xs leading-relaxed text-(--ui-text-secondary)">
            Finish turns it into notes. Discard throws the audio away — that cannot be undone.
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button onClick={() => setConfirmEnd(false)} size="sm" type="button" variant="secondary">
              Keep recording
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="composer-end-discard"
              onClick={discardRecording}
              size="sm"
              type="button"
            >
              Discard
            </Button>
            <Button data-testid="composer-end-finish" onClick={finishRecording} size="sm" type="button">
              Finish and write it up
            </Button>
          </div>
        </div>
      )}
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
    <span aria-hidden className="flex h-3 items-center gap-[2px]">
      {[0.5, 1, 0.7, 0.35].map((scale, index) => (
        <span className="w-[2px] rounded-full bg-current" key={index} style={{ height: `${scale * 100}%` }} />
      ))}
    </span>
  );
}

/** How often dictation's own meter samples, matching the recorder's tick so the
 *  waveform moves at one speed whichever microphone is feeding it. */
const DICTATION_METER_MS = 90;

/** Speech-recognition errors that will still be true next time, so retrying is
 *  pointless. Everything ELSE — above all `no-speech`, which Chrome fires every
 *  time the speaker pauses to think — is transient and must restart, or
 *  dictation dies at the first silence. */
const TERMINAL_SPEECH_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);

// Dense, retina-backed rolling audio: 96 mirrored samples instead of the old 24
// chunky DOM bars. It uses the same canvas renderer as the recorder, so the
// composer and dictation meter have one high-definition waveform language.
function AudioWaveform({ active, className, label }: { active: boolean; className?: string; label?: string }) {
  const historyRef = useRef(emptyWaveform());

  useEffect(() => {
    if (!active) {
      historyRef.current = emptyWaveform();
      return;
    }
    return subscribeMicLevel((level) => {
      historyRef.current = pushWaveBar(historyRef.current, { captured: true, level });
    });
  }, [active]);

  return (
    <div
      aria-label={label ?? (active ? "Recording audio waveform" : "Microphone idle")}
      className={className ?? "h-(--composer-input-min-height) w-full"}
      data-testid="composer-waveform"
      role="img"
    >
      <RecordingWaveform active={active} bars={historyRef} className="block size-full" />
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
//
// Folder and Syllabus were REMOVED (owner 2026-08-03: "it should only allow
// files — syllabus is a type of file"). Syllabus routing still exists, two
// ways now: a file whose NAME matches looksLikeSyllabus, or the student's own
// words asking for a calendar import (asksForCalendarImport in session-chat)
// — which is how a syllabus named "Fall-2026-PHCY-2105-01-….pdf" reaches the
// reviewed importer despite a filename that says nothing.
function AddMenu({ onChooseFiles, onOpenLibrary }: { onChooseFiles: () => void; onOpenLibrary: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Add to chat" className="size-(--composer-control-size) shrink-0 rounded-full text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground" size="icon" type="button" variant="ghost">
          <Codicon name="add" size="0.8rem" />
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

