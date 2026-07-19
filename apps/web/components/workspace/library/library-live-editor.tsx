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
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(28, textarea.scrollHeight)}px`;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  return (
    <textarea
      aria-label="Edit note block"
      className={cn(
        "block min-h-7 w-full resize-none overflow-hidden bg-transparent p-0 font-sans text-foreground outline-none placeholder:text-(--ui-text-quaternary)",
        activeBlockClass(value),
      )}
      onBlur={onBlur}
      onChange={(event) => {
        event.currentTarget.style.height = "0px";
        event.currentTarget.style.height = `${Math.max(28, event.currentTarget.scrollHeight)}px`;
        onChange(event.target.value);
      }}
      placeholder="Write in Markdown. Link another note with [[Note name]]."
      ref={ref}
      spellCheck
      value={value}
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
    <div className="min-h-[28rem] p-1" data-slot="library-live-editor">
      {blocks.map((block, index) => (
        <div className="min-h-7 py-1" key={`${index}:${blocks.length}`}>
          {activeIndex === index ? (
            <ActiveBlock onBlur={() => setActiveIndex(null)} onChange={(next) => updateBlock(index, next)} value={block} />
          ) : (
            <div
              className="min-h-7 cursor-text rounded-md px-0 py-0.5 outline-none hover:bg-[color-mix(in_srgb,var(--ui-base)_2%,transparent)]"
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setActiveIndex(index);
              }}
              role="button"
              tabIndex={0}
            >
              {block ? (
                <AssistantMarkdown isWikiLinkAvailable={isWikiLinkAvailable} onWikiLink={onWikiLink} text={block} />
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
