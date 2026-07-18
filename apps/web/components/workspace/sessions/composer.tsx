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
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { ChevronDown } from "@/lib/workspace/icons";
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
  placeholder: string;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

export function Composer({ busy, placeholder, onSubmit, onStop }: ComposerProps) {
  const inputRef = useRef<HTMLDivElement>(null);
  const [hasText, setHasText] = useState(false);
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
    if (!text) return;
    el.textContent = "";
    setHasText(false);
    onSubmit(text);
  }, [busy, onSubmit]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div
      className="group/composer absolute bottom-0 left-1/2 z-30 w-[min(var(--composer-width),calc(100%-2rem))] max-w-full -translate-x-1/2 overflow-visible rounded-2xl pt-2 pb-[var(--composer-shell-pad-block-end)]"
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
            className="relative z-1 flex min-h-0 w-full flex-col gap-(--composer-row-gap) overflow-hidden rounded-[inherit] px-(--composer-surface-pad-x) py-(--composer-surface-pad-y)"
            data-slot="composer-fade"
          >
            <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-(--composer-control-gap) [grid-template-areas:'menu_input_controls']">
              <div className="flex translate-y-[3px] items-start self-start [grid-area:menu]">
                <AttachMenu />
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
                      disabled={!hasText}
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

function AttachMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Attach"
          className="size-(--composer-control-size) shrink-0 rounded-md text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground data-[state=open]:bg-(--chrome-action-hover) data-[state=open]:text-foreground"
          size="icon"
          variant="ghost"
        >
          <Codicon name="add" size="0.875rem" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" side="top" sideOffset={6}>
        <DropdownMenuLabel className="px-2 pb-0.5 pt-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)">
          Attach
        </DropdownMenuLabel>
        <DropdownMenuItem className="text-[length:var(--conversation-tool-font-size)]" disabled>
          Attachments arrive with cloud sync — use the Mac app for now
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
