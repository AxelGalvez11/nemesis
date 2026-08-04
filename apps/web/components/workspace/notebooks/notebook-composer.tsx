"use client";

// Notebook chats intentionally share the same composer implementation as
// Sessions so attachments, dictation, Chat/Record mode, keyboard behavior,
// waveform state, and the recording companion panel cannot drift apart.

import type { ComposerMode } from "@/components/workspace/sessions/composer";
import { Composer } from "@/components/workspace/sessions/composer";
import type { ChatEffort } from "@/lib/workspace/chat-effort";

interface NotebookComposerProps {
  onSubmit: (text: string, files: File[]) => void;
  disabled?: boolean;
  working?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  large?: boolean;
  onModeChange?: (mode: ComposerMode) => void;
  onEffortChange?: (effort: ChatEffort) => void;
  onRecordingChange?: (recording: boolean, options?: { discard?: boolean }) => void;
  onRecordingPauseToggle?: () => void;
  recordingBusy?: boolean;
  recordingPaused?: boolean;
  showRecordCompanion?: boolean;
  mode?: ComposerMode;
}

export function NotebookComposer({
  onSubmit,
  disabled,
  working = false,
  placeholder = "Ask a question",
  onModeChange,
  onEffortChange,
  onRecordingChange,
  onRecordingPauseToggle,
  recordingBusy,
  recordingPaused,
  showRecordCompanion,
  mode,
}: NotebookComposerProps) {
  return (
    <Composer
      busy={Boolean(disabled || working)}
      mode={mode}
      onEffortChange={onEffortChange}
      onModeChange={onModeChange}
      onRecordingChange={onRecordingChange}
      onRecordingPauseToggle={onRecordingPauseToggle}
      onStop={() => undefined}
      onSubmit={onSubmit}
      placement="inline"
      placeholder={placeholder}
      recordingBusy={recordingBusy}
      recordingPaused={recordingPaused}
      showRecordCompanion={showRecordCompanion}
    />
  );
}
