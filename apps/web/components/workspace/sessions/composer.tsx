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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  /** Opens the syllabus importer as a popup over the chat. Chat is the front
   *  door for importing now (owner 2026-07-31), so this is not a shortcut to
   *  somewhere else — it is where the import lives. */
  onImportSyllabus?: () => void;
  onSubmit: (text: string, files: File[]) => void;
  onStop: () => void;
  showRecordCompanion?: boolean;
  /** Rendered under the pill, aligned to its left edge (the Projects chip). */
  belowStart?: ReactNode;
}

export function Composer({ busy, centered = false, placement = "floating", placeholder, mode, onModeChange, onEffortChange, onImportSyllabus, onRecordingChange, onSubmit, onStop, showRecordCompanion = true, belowStart }: ComposerProps) {
  const inputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [hasText, setHasText] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  /** Standing rule: anything that destroys something asks first. Recorded audio
   *  is not recoverable, so cancelling mid-capture is exactly that. */
  const [confirmDiscard, setConfirmDiscard] = useState(false);
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
      // 🔴 THIS USED TO SAVE THE RECORDING. Clearing `recording` is the same
      // signal a deliberate stop sends, so pressing ✕ mid-capture uploaded,
      // transcribed and filed the very recording the student was cancelling
      // (owner-reported 2026-07-31). Cancelling now asks first and then throws
      // the audio away — see confirmDiscard below. Stop lives in the recording
      // panel, which is where the recording is.
      setConfirmDiscard(true);
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

  /** Confirmed cancel: bin the audio AND leave record mode, in that order, so
   *  the recorder reads `discard` before it sees `active` go false. */
  const discardRecording = () => {
    setConfirmDiscard(false);
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

  const onDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(event.dataTransfer)) return;
    dragDepth.current += 1;
    setDragOver(true);
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(event.dataTransfer)) return;
    // Without BOTH preventDefaults the browser navigates away to the dropped
    // file and the whole composer state is lost.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(event.dataTransfer)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const dropped = Array.from(event.dataTransfer.files);
    // Appended, never replaced — same rule the "+" picker follows, so a drop
    // cannot bin notes that were just attached from the Library.
    if (dropped.length > 0) setFiles((current) => [...current, ...dropped]);
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
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Owner 2026-07-28: "the webapp should allows drag and drop into the
          chat composer". Owner 2026-08-02: "i need the drop to attach to be a
          box ABOVE the chat composer" — it used to be an overlay laid across
          the composer, which blanked out whatever the student had already
          typed at the exact moment they were adding to it.
          `bottom-full` floats it above WITHOUT taking layout space. In flow it
          would shove the composer down out from under a moving cursor, which
          during a drag is how you drop a file on the wrong thing.
          🔴 POINTER EVENTS MUST STAY ON. The old overlay set
          pointer-events-none, and that was only safe because the composer sat
          directly behind it to catch the drop. Up here there is nothing behind
          but the message list, so a click-through box would hand the file to
          the page and the browser would NAVIGATE AWAY to it, losing the draft.
          This is still a DOM child of the root, so the drop bubbles to onDrop.
          🔴 THE HIT AREA MUST STAY CONTIGUOUS WITH THE ROOT — the visual gap
          under the box is PADDING on this wrapper, never a margin. A margin is
          dead space: the instant the cursor crosses it, dragleave fires with
          nothing entered in exchange, the depth counter hits zero, and the box
          unmounts while the student is still carrying the file toward it.
          (Owner 2026-08-03: "the box disappears when users try to drag to
          that space" — that was `mb-2` on the box itself.) */}
      {dragOver && activeMode === "chat" && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-full z-30 pb-2"
          data-slot="composer-drop-target"
        >
          <div className="grid h-24 place-content-center justify-items-center gap-1.5 rounded-2xl border-2 border-dashed border-(--theme-primary) bg-[color-mix(in_srgb,var(--theme-primary)_7%,var(--dt-input))] backdrop-blur-[0.75rem]">
            <Codicon className="text-(--theme-primary)" name="cloud-upload" size="1.15rem" />
            <span className="text-xs font-medium text-(--ui-text-secondary)">Drop to attach</span>
          </div>
        </div>
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
                    <input
                      className="sr-only"
                      multiple
                      onChange={(event) => {
                        const picked = Array.from(event.target.files ?? []);
                        if (picked.length > 0) setFiles((current) => [...current, ...picked]);
                        event.target.value = "";
                      }}
                      ref={(node) => {
                        folderInputRef.current = node;
                        node?.setAttribute("webkitdirectory", "");
                      }}
                      type="file"
                    />
                    <AddMenu onChooseFiles={() => fileInputRef.current?.click()} onChooseFolder={() => folderInputRef.current?.click()} onImportSyllabus={onImportSyllabus} onOpenLibrary={() => setLibraryOpen(true)} />
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
                  {/* Dictation is hidden in record mode: a live microphone is
                      already being captured, so a second one is nonsense. */}
                  {/* Only while dictating, and only wide enough to read as
                      movement — the text going into the box is the real
                      feedback; this says the microphone is hearing you at all,
                      which is the thing a silent box cannot tell you. */}
                  {activeMode === "chat" && listening && (
                    <AudioWaveform active className="h-7 w-24 shrink-0" label="Dictation audio waveform" />
                  )}
                  {activeMode === "chat" && <Button aria-label={listening ? "Stop dictating" : "Dictate"} aria-pressed={listening} className={cn("size-(--composer-control-size) rounded-full", listening && "bg-(--ui-control-active-background) text-foreground")} onClick={startDictation} size="icon" variant="ghost"><Mic size={15} /></Button>}
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
      {/* Sits directly above the composer, in the student's way, matching the
          chat's own delete confirmation. Keep is the plain button; throwing the
          audio away is the only red control. */}
      {confirmDiscard && (
        <div
          className="absolute inset-x-0 bottom-full z-40 mx-auto mb-3 w-full max-w-md rounded-xl border border-red-500/40 bg-(--ui-bg-elevated) p-4 shadow-lg"
          data-testid="confirm-discard-recording"
          role="alertdialog"
        >
          <p className="text-sm font-semibold text-(--ui-text-primary)">Throw this recording away?</p>
          <p className="mt-1 text-xs leading-relaxed text-(--ui-text-secondary)">
            The audio has not been saved yet and cannot be recovered. To keep it, use Stop instead.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button onClick={() => setConfirmDiscard(false)} size="sm" type="button" variant="secondary">
              Keep recording
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-discard-recording-yes"
              onClick={discardRecording}
              size="sm"
              type="button"
            >
              Throw it away
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
    <span aria-hidden className="flex h-3.5 items-center gap-[2px]">
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
function AddMenu({ onChooseFiles, onChooseFolder, onImportSyllabus, onOpenLibrary }: { onChooseFiles: () => void; onChooseFolder: () => void; onImportSyllabus?: () => void; onOpenLibrary: () => void }) {
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
        <DropdownMenuItem onSelect={onChooseFolder}>
          <Codicon name="folder" size="0.875rem" />
          Folder
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="composer-add-library" onSelect={onOpenLibrary}>
          <Codicon name="book" size="0.875rem" />
          Library
        </DropdownMenuItem>
        {/* 🔴 THE ONLY RELIABLE WAY IN. Dropping a syllabus already routes to
            the importer, but only when the FILENAME says "syllabus" — and the
            owner's own file is called
            Fall-2026-PHCY-2105-01-Interprofessional-Education-and-Clinical-
            Simulation-III.pdf, which says nothing of the kind. A student whose
            university names files that way had no way to reach the importer
            from chat at all. Saying what you want beats guessing from a name. */}
        {onImportSyllabus && (
          <DropdownMenuItem data-testid="composer-import-syllabus" onSelect={onImportSyllabus}>
            <Codicon name="calendar" size="0.875rem" />
            Syllabus
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

