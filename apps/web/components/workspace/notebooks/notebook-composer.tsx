"use client";

// Notebook chats intentionally share the same composer implementation as
// Sessions so attachments, dictation, Chat/Record mode, keyboard behavior,
// waveform state, and the recording companion panel cannot drift apart.

import type { ComposerMode } from "@/components/workspace/sessions/composer";
import { Composer } from "@/components/workspace/sessions/composer";

interface NotebookComposerProps {
  onSubmit: (text: string, files: File[]) => void;
  disabled?: boolean;
  working?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  large?: boolean;
  onModeChange?: (mode: ComposerMode) => void;
}

export function NotebookComposer({
  onSubmit,
  disabled,
  working = false,
  placeholder = "Ask a question",
  onModeChange,
}: NotebookComposerProps) {
  return (
    <Composer
      busy={Boolean(disabled || working)}
      onModeChange={onModeChange}
      onStop={() => undefined}
      onSubmit={onSubmit}
      placement="inline"
      placeholder={placeholder}
    />
  );
}
