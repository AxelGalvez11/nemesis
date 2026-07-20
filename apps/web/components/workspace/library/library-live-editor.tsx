"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { cn } from "@/lib/utils";

interface LibraryLiveEditorProps {
  value: string;
  onChange: (value: string) => void;
  onWikiLink: (target: string) => void;
  isWikiLinkAvailable: (target: string) => boolean;
}

function splitBlocks(value: string): string[] {
  if (!value) return [""];
  return value.split(/\n{2,}/);
}

function activeBlockClass(block: string): string {
  const heading = block.match(/^(#{1,4})\s/);
  if (!heading) return "text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height)";
  return cn(
    "font-semibold tracking-tight",
    heading[1]?.length === 1 && "text-[1rem]",
    heading[1]?.length === 2 && "text-[0.9375rem]",
    heading[1]?.length === 3 && "text-[0.875rem]",
    heading[1]?.length === 4 && "text-[0.8125rem]",
  );
}

function ActiveBlock({ value, onChange, onBlur }: { value: string; onChange: (value: string) => void; onBlur: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const initialValue = useRef(value);

  useEffect(() => {
    const editor = ref.current;
    if (!editor) return;
    // Keep the editable DOM uncontrolled while the user is typing. Rendering
    // `value` as a React child makes every keystroke replace the text node,
    // which sends the caret back to the start and breaks arrow navigation.
    editor.textContent = initialValue.current;
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  return (
    <div
      aria-label="Edit note block"
      className={cn(
        "block min-h-7 w-full whitespace-pre-wrap break-words bg-transparent p-0 font-sans text-foreground outline-none empty:before:pointer-events-none empty:before:text-(--ui-text-quaternary) empty:before:content-[attr(data-placeholder)]",
        activeBlockClass(value),
      )}
      contentEditable
      data-placeholder="Write in Markdown. Link another note with [[Note name]]."
      onBlur={onBlur}
      onInput={(event) => onChange(event.currentTarget.innerText.replace(/\u00a0/g, " "))}
      ref={ref}
      role="textbox"
      spellCheck
      suppressContentEditableWarning
    />
  );
}

export function LibraryLiveEditor({ value, onChange, onWikiLink, isWikiLinkAvailable }: LibraryLiveEditorProps) {
  const blocks = useMemo(() => splitBlocks(value), [value]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  function updateBlock(index: number, next: string) {
    const updated = [...blocks];
    updated[index] = next;
    onChange(updated.join("\n\n"));
  }

  return (
    <div
      className="min-h-[38rem] w-full cursor-text bg-transparent p-1"
      data-slot="library-live-editor"
      onClick={(event) => {
        if (event.currentTarget === event.target) setActiveIndex(Math.max(0, blocks.length - 1));
      }}
    >
      {blocks.map((block, index) => (
        <div className="min-h-7 py-1" key={`${index}:${blocks.length}`}>
          {activeIndex === index ? (
            <ActiveBlock onBlur={() => setActiveIndex(null)} onChange={(next) => updateBlock(index, next)} value={block} />
          ) : (
            <div
              className="min-h-7 cursor-text bg-transparent px-0 py-0.5 outline-none"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a, button")) return;
                setActiveIndex(index);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setActiveIndex(index);
              }}
              role="button"
              tabIndex={0}
            >
              {block ? (
                <AssistantMarkdown externalLinksInNewTab={false} isWikiLinkAvailable={isWikiLinkAvailable} obsidianTags onWikiLink={onWikiLink} text={block} />
              ) : (
                <span className="text-(--ui-text-quaternary)">Write in Markdown…</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
