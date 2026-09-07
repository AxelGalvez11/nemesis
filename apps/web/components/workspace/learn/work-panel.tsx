"use client";

// The Outputs and Sources card beside the conversation: ChatGPT Work's rail, one for one.
//
// Owner, 2026-09-06: *"the nemesis chat still doesnt match chatgpt work … make it perfect one to
// one okay? exclude the 'share' and three dots icon button"*, then *"panel, everything pretty
// much"*. Measured in his signed-in Chrome on a Work conversation (docs/chatgpt-work-chat-reference.md
// §5): a 300-wide card under the header, 31 from the right edge, radius 24, a hairline and a soft
// shadow, 4px of padding top and bottom; two sections, each a 28px header button (14px label and a
// 12px chevron) with a 28px `+` at the row's right; 32px rows with a mark, 14px text; a hairline
// between the sections inset 20. The header's toggle opens and closes it, and the conversation
// column re-centres in the space it leaves.
//
// 🔴 IT STANDS; IT IS NOT A POPOVER. The rail it replaces closed on any click outside it, which is
// the one behaviour theirs does not have: theirs stays until the toggle is pressed again, and the
// learner reads the sources while typing. So no `useDismiss`, no Escape, no outside-click.
//
// 🔴 OUTPUTS = what this chat made; SOURCES = the files attached to it and Web search. Owner's
// answer, 2026-09-06, to "what should Sources list?": *"Files + Web search"*. Not connected apps,
// not Memory, and not the pages Nemesis read on its own (those stay as the answer's source cards).
//
// 🔴 NO `+` ON OUTPUTS. Theirs offers "Create file or site" there; the owner ruled on 2026-08-24
// that outputs are asked for in words (`outputs-have-no-make-buttons.test.ts`), and today's
// answers did not reverse that. The `+` on Sources attaches a file, which is theirs exactly.
//
// 🔴 WEB SEARCH IS A ROW YOU PRESS, NOT A SWITCH. A standing on/off would be the persistent mode
// the composer's capability doctrine bans ("one-shot, cleared by submit"). Pressing the row
// declares Web search for the NEXT send, exactly as picking it from the composer's `+` does, and
// the chip in the composer shows it is armed.

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Codicon } from "@/components/desktop-ui/codicon";
import { OUTPUT_KIND_MARKS } from "@/components/workspace/learn/artifact-card";
import type { CanvasOutput, CanvasSource } from "@/lib/learn/canvas-model";
import { ACCEPTED_MATERIAL } from "@/lib/learn/canvas-tasks";
import { fileMark } from "@/lib/learn/kind-mark";
import { cn } from "@/lib/utils";

/** The card's width, and how much of the window it takes together with its 31px right margin. */
export const WORK_PANEL_WIDTH = 300;
export const WORK_PANEL_INSET = WORK_PANEL_WIDTH + 31;

/** Remembered per browser; a missing or blocked store means open, which is how theirs opens. */
export const WORK_PANEL_KEY = "nemesis.chat.work-panel";

export function readWorkPanelOpen(): boolean {
  try {
    return window.localStorage.getItem(WORK_PANEL_KEY) !== "closed";
  } catch {
    return true;
  }
}

export function writeWorkPanelOpen(open: boolean): void {
  try {
    window.localStorage.setItem(WORK_PANEL_KEY, open ? "open" : "closed");
  } catch {
    /* not remembered */
  }
}

/**
 * The card: fixed at the window's top-right, 31 in and 52 down, which is theirs exactly. It is
 * portalled to the body because the header it is pressed from arrives on a transform
 * (`canvas-chrome-in`), and a fixed box inside a transformed ancestor is fixed to the ancestor.
 * It also has to stay put while the conversation narrows beside it, which a child of the
 * narrowing surface cannot.
 */
export const WORK_CARD =
  "canvas-chrome-in fixed right-[31px] top-[52px] z-40 max-h-[calc(100svh-84px)] overflow-y-auto rounded-[24px] " +
  "bg-(--ui-bg-elevated) py-[4px] shadow-[0_4px_16px_rgba(0,0,0,0.05)] ring-1 ring-(--ui-stroke-tertiary) scrollbar-dt";

const ROW =
  "flex h-[32px] w-full min-w-0 items-center gap-[8px] rounded-[12px] px-[8px] py-[6px] text-left text-[length:var(--canvas-text-small)] leading-[20px] text-(--ui-text-primary) transition-colors hover:bg-(--ui-bg-tertiary)";

function Section({ addLabel, children, label, onAdd }: { addLabel?: string; children: ReactNode; label: string; onAdd?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <section data-work-section={label.toLowerCase()}>
      <div className="flex h-[34px] items-center pl-[5px] pr-[13px]">
        <button
          aria-expanded={open}
          className="flex h-[28px] min-w-0 items-center gap-[6px] rounded-[4px] px-[16px] py-[4px] text-[length:var(--canvas-text-small)] leading-[20px] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary)"
          onClick={() => setOpen((was) => !was)}
          type="button"
        >
          <span className="truncate">{label}</span>
          <Codicon aria-hidden className="shrink-0 text-(--ui-text-tertiary)" name={open ? "chevron-down" : "chevron-right"} size="12px" />
        </button>
        <span className="min-w-0 flex-1" />
        {onAdd && addLabel && (
          <button
            aria-label={addLabel}
            className="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            onClick={onAdd}
            title={addLabel}
            type="button"
          >
            <Codicon aria-hidden name="add" size="20px" />
          </button>
        )}
      </div>
      {open && <ul className="m-0 list-none px-[13px] pb-[4px]">{children}</ul>}
    </section>
  );
}

/**
 * 🔴 GUARDED ON THE PAYLOAD, NOT THE KIND (capabilities-are-live.test.ts). A row opens the thing it
 * names only when there is something to open: a note by its path, a deck by its id, slides by their
 * plan, a document, PDF or sheet by its bytes. A made thing still on its way is a row, not a door.
 */
function canOpen(output: CanvasOutput): boolean {
  if (output.notePath) return true;
  if (output.kind === "flashcards" && output.deckId) return true;
  if (output.kind === "slides" && output.deck) return true;
  if ((output.kind === "document" || output.kind === "pdf" || output.kind === "sheet") && (output.markdown || output.sheet)) return true;
  return false;
}

function OutputRow({ onOpen, output }: { onOpen: (output: CanvasOutput) => void; output: CanvasOutput }) {
  const mark = OUTPUT_KIND_MARKS[output.kind] ?? { icon: "file", tint: "--ui-text-quaternary" };
  const body = (
    <>
      <Codicon aria-hidden className="shrink-0" name={mark.icon} size="16px" style={{ color: `var(${mark.tint})` }} />
      <span className="min-w-0 flex-1 truncate">{output.title}</span>
    </>
  );
  if (!canOpen(output)) return <li className={cn(ROW, "cursor-default hover:bg-transparent")}>{body}</li>;
  return (
    <li>
      <button className={ROW} onClick={() => onOpen(output)} title={output.title} type="button">
        {body}
      </button>
    </li>
  );
}

/** The panel and the model apply the SAME test (canvas-retrieval.test.ts): a file with no usable
 *  text did not read; a degraded parse read partly. */
function sourceReadWarning(source: CanvasSource): string | null {
  const usable = source.excerpts.filter((excerpt) => excerpt.text.trim().length > 0).length;
  if (usable === 0) return "not read";
  if (source.parseQuality === "degraded") return "partly read";
  return null;
}

function FileRow({ onOpen, source }: { onOpen: (source: CanvasSource) => void; source: CanvasSource }) {
  const mark = fileMark(source.title, source.kind);
  return (
    <li>
      <button className={ROW} onClick={() => onOpen(source)} title={source.title} type="button">
        <Codicon aria-hidden className="shrink-0" name={mark.icon} size="20px" style={{ color: `var(${mark.tint})` }} />
        <span className="min-w-0 flex-1 truncate">{source.title}</span>
        {/* 🔴 THE LEARNER'S SPELLING, NOT THE MODEL'S (model-copy-stays-with-the-model.test.ts):
            `coverageLabel` is the parsed coverage rendered short; `coverageNote` is written for the
            model and never reaches this row. A file that did not read must not look like one that did. */}
        {source.coverageLabel && (
          <span className="min-w-0 max-w-[45%] truncate text-[length:var(--canvas-text-meta)] leading-[16px] text-amber-500">{source.coverageLabel}</span>
        )}
        {!source.coverageLabel && sourceReadWarning(source) && (
          <span className="shrink-0 text-[length:var(--canvas-text-meta)] leading-[16px] text-amber-500">{sourceReadWarning(source)}</span>
        )}
      </button>
    </li>
  );
}

export function WorkPanel({
  documents,
  modelKnowledge = false,
  onFiles,
  onOpenDocument,
  onOpenOutput,
  onWebSearch,
  outputs,
  webSearchArmed = false,
}: {
  documents: readonly CanvasSource[];
  /** The chat holds knowledge that provably came from the model rather than a file (N10); said
   *  where the files would be, so a source list is never read as the whole story. */
  modelKnowledge?: boolean;
  onFiles: (files: FileList | File[]) => void;
  onOpenDocument: (source: CanvasSource) => void;
  onOpenOutput: (output: CanvasOutput) => void;
  /** Declare Web search for the next send. Absent when the composer cannot take a capability. */
  onWebSearch?: () => void;
  outputs: readonly CanvasOutput[];
  webSearchArmed?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  if (typeof document === "undefined") return null;
  // 🔴 `data-workspace` ON THE PORTAL ROOT, or every button in it wears the page's raw defaults
  // (dock-panel.tsx carries the same stamp for the same reason).
  return createPortal(
    <div aria-label="Outputs and sources" className={WORK_CARD} data-work-panel="" data-workspace="" role="region" style={{ width: WORK_PANEL_WIDTH }}>
      <Section label="Outputs">
        {outputs.length === 0 && <li className="px-[8px] py-[6px] text-[length:var(--canvas-text-small)] leading-[20px] text-(--ui-text-quaternary)">Nothing made yet</li>}
        {outputs.map((output) => (
          <OutputRow key={output.id} onOpen={onOpenOutput} output={output} />
        ))}
      </Section>
      <div aria-hidden className="mx-[20px] my-[4px] h-px bg-(--ui-stroke-tertiary)" />
      <Section addLabel="Add source" label="Sources" onAdd={() => picker.current?.click()}>
        {onWebSearch && (
          <li>
            <button
              aria-pressed={webSearchArmed}
              className={cn(ROW, webSearchArmed && "bg-(--ui-bg-tertiary)")}
              onClick={onWebSearch}
              title={webSearchArmed ? "Web search is on for your next message" : "Search the web with your next message"}
              type="button"
            >
              <Codicon aria-hidden className="shrink-0 text-(--ui-text-secondary)" name="globe" size="20px" />
              <span className="min-w-0 flex-1 truncate">Web search</span>
            </button>
          </li>
        )}
        {documents.map((source) => (
          <FileRow key={source.id} onOpen={onOpenDocument} source={source} />
        ))}
        {/* 🔴 THE MODEL'S OWN KNOWLEDGE IS NOT A SOURCE, AND IT IS NOT HIDDEN EITHER (owner
            2026-09-01). It is the sentence in the place a file would be, never a row. */}
        {documents.length === 0 && (
          <li className="px-[8px] py-[6px] text-[length:var(--canvas-text-meta)] leading-[16px] text-(--ui-text-quaternary)">
            {modelKnowledge ? "Nothing attached yet. This was answered from Nemesis's own knowledge." : "Nothing attached yet"}
          </li>
        )}
      </Section>
      <input
        accept={ACCEPTED_MATERIAL}
        className="sr-only"
        multiple
        onChange={(event) => {
          if (event.target.files) onFiles(event.target.files);
          event.target.value = "";
        }}
        ref={picker}
        type="file"
      />
    </div>,
    document.body,
  );
}
