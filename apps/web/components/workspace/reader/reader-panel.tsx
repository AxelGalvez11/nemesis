"use client";

// Right panel: what you can DO with this document, and what Nemesis already
// knows about it.
//
// The actions are source-aware — each one carries the file and, when the reader
// measured one, the page or slide the selection is physically on. That is the
// whole point of them living here rather than in the chat composer: an answer
// that starts from this panel can be traced back to a location in a document,
// and one typed into a blank chat box cannot.
//
// "Notes from this file" is real provenance, not a guess: the rows come from
// `library_provenance`, written when an import created a note from this source.

import { Codicon } from "@/components/desktop-ui/codicon";
import { READER_ACTIONS, type ReaderActionId } from "@/lib/reader/reader-actions";
import { folderTrail } from "@/lib/reader/reader-source";
import { cn } from "@/lib/utils";

export interface LinkedNote {
  id: string;
  title: string;
  path: string;
}

interface ReaderPanelProps {
  /** The text the student has selected, if any — decides what the actions say. */
  selection: string | null;
  /** The measured page/slide the selection is on. */
  selectionUnit: number | null;
  unitLabel: string;
  regionPreview: string | null;
  onAction: (action: ReaderActionId) => void;
  linkedNotes: readonly LinkedNote[];
  onOpenNote: (path: string) => void;
  folderPath: string;
  meta: string;
  /** Set when the file could not be found in storage. */
  unavailable: boolean;
}

export function ReaderPanel({
  selection, selectionUnit, unitLabel, regionPreview, onAction, linkedNotes, onOpenNote, folderPath, meta, unavailable,
}: ReaderPanelProps) {
  const trail = folderTrail(folderPath);
  const scope = selection
    ? `the passage you selected${selectionUnit === null ? "" : ` on ${unitLabel} ${selectionUnit}`}`
    : regionPreview
      ? "the part of the picture you boxed"
      : "this whole document";

  return (
    <aside
      className="flex h-full w-72 shrink-0 flex-col gap-5 overflow-y-auto overscroll-contain border-l border-(--ui-stroke-tertiary) bg-(--ui-bg-sidebar) p-4"
      data-testid="reader-panel"
    >
      <section>
        <PanelHeading>Ask Nemesis</PanelHeading>
        <p className="mt-1 mb-2.5 text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)" data-testid="reader-panel-scope">
          Acts on <span className="text-(--ui-text-secondary)">{scope}</span>.
        </p>
        {regionPreview && (
          // eslint-disable-next-line @next/next/no-img-element -- an in-memory data: URL of the crop the student just made
          <img
            alt="The part of the picture you selected"
            className="mb-2.5 w-full rounded-md border border-(--ui-stroke-tertiary)"
            src={regionPreview}
          />
        )}
        {selection && (
          <blockquote className="mb-2.5 max-h-24 overflow-hidden rounded-md border-l-2 border-(--ui-stroke-secondary) bg-(--ui-bg-quaternary) px-2.5 py-1.5 text-[0.6875rem] leading-relaxed text-(--ui-text-secondary)">
            {selection.length > 240 ? `${selection.slice(0, 240)}…` : selection}
          </blockquote>
        )}
        <div className="flex flex-col gap-0.5">
          {READER_ACTIONS.map((action) => (
            <button
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.75rem] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-foreground disabled:opacity-40"
              disabled={unavailable}
              key={action.id}
              onClick={() => onAction(action.id)}
              title={action.hint}
              type="button"
            >
              <Codicon className="shrink-0 text-(--ui-text-quaternary)" name={action.icon} size="0.8rem" />
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <PanelHeading>Notes from this file</PanelHeading>
        {linkedNotes.length === 0 ? (
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)">
            Nothing in your Library cites this file yet.
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {linkedNotes.map((note) => (
              <li key={note.id}>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.75rem] text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary) hover:text-foreground"
                  onClick={() => onOpenNote(note.path)}
                  type="button"
                >
                  <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="note" size="0.8rem" />
                  <span className="min-w-0 flex-1 truncate">{note.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <PanelHeading>Filed under</PanelHeading>
        {trail.length === 0 ? (
          <p className="mt-1 text-[0.6875rem] text-(--ui-text-tertiary)">The Library root.</p>
        ) : (
          <p className="mt-1 text-[0.75rem] leading-relaxed text-(--ui-text-secondary)">
            {trail.map((segment, index) => (
              <span key={`${segment}-${index}`}>
                {index > 0 && <span className="mx-1 text-(--ui-text-quaternary)">›</span>}
                {segment}
              </span>
            ))}
          </p>
        )}
        <p className="mt-1.5 text-[0.6875rem] text-(--ui-text-tertiary)">{meta}</p>
      </section>
    </aside>
  );
}

function PanelHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)", className)}>
      {children}
    </h2>
  );
}
