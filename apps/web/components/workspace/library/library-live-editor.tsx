"use client";

import { useLayoutEffect, useRef } from "react";

interface LibraryLiveEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/** A single native editing surface keeps selection, arrow navigation, and the
 * caret under the browser's control. Markdown stays plain while editing and is
 * rendered (including #tag pills and wiki links) in Read mode. */
export function LibraryLiveEditor({ value, onChange }: LibraryLiveEditorProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.style.height = "0px";
    editor.style.height = `${Math.max(editor.scrollHeight, 608)}px`;
  }, [value]);

  return (
    <textarea
      aria-label="Edit note"
      className="block min-h-[38rem] w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent p-1 font-sans text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground outline-none"
      data-slot="library-live-editor"
      onChange={(event) => onChange(event.target.value)}
      ref={editorRef}
      spellCheck
      value={value}
      wrap="soft"
    />
  );
}
