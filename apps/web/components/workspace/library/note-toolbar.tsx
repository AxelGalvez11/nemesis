"use client";

// The note's formatting bar (owner 2026-08-04: "keep it minimal … A small
// floating or top toolbar is enough … The toolbar should probably only appear
// when the user clicks into a note or selects text. Most of the time, the
// page should stay clean and look like documentation, not an editor.")
//
// One slim pill, exactly the owner's list of controls, floating over the top
// of the article only while the editor is focused. Every action goes through
// the pure command layer (note-editor-commands.ts) against the live
// EditorView; mousedown on the bar is prevented so clicking a button never
// steals the editor's focus or collapses the selection. A "/" menu was
// deliberately deferred (owner: "Don't do the slash commands this round").

import katex from "katex";
import type { EditorView } from "prosemirror-view";
import type { Command } from "prosemirror-state";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import {
  currentBlockKind,
  insertEquation,
  insertImage,
  insertNoteLink,
  isInChecklist,
  isInCodeBlock,
  isInList,
  isInQuote,
  isMarkActive,
  NOTE_MENU,
  noteMenuCommand,
  setBlockKind,
  toggleBold,
  toggleItalic,
  type NoteBlockKind,
} from "@/lib/workspace/note-editor-commands";
import { noteSchema } from "@/lib/workspace/note-schema";
import { cn } from "@/lib/utils";

interface NoteToolbarProps {
  /** The live editor, or null before it mounts. */
  view: EditorView | null;
  /** Shown only while the student is editing — the page stays documentation
   *  the rest of the time. */
  visible: boolean;
  /** The heading menu holds the bar open while the editor is blurred. */
  onPinnedChange: (pinned: boolean) => void;
}

const BLOCK_LABELS: Record<NoteBlockKind, string> = {
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  other: "Text",
  paragraph: "Text",
};

/** The three commands that need something typed first. They used to go
 *  through window.prompt, which is exactly the "button with no UI" the owner
 *  flagged (2026-08-04: "all the buttons in the formatting toolbar should
 *  have UI especially the math equation button") — and a native prompt
 *  doesn't render at all in some desktop shells. Each now opens a small
 *  panel right under the bar; the equation one previews the maths live. */
type ToolbarInputKind = "note-link" | "image" | "equation";

const INPUT_COPY: Record<ToolbarInputKind, { label: string; placeholder: string; cta: string }> = {
  equation: { cta: "Insert equation", label: "Equation (LaTeX)", placeholder: "e.g. \\frac{dy}{dx} = 3x^2" },
  image: { cta: "Insert image", label: "Image address (URL)", placeholder: "https://…" },
  "note-link": { cta: "Link", label: "Link to note", placeholder: "Note title" },
};

function menuItem(id: string) {
  const item = NOTE_MENU.find((entry) => entry.id === id);
  if (!item) throw new Error(`note menu is missing ${id}`);
  return item;
}

export function NoteToolbar({ view, visible, onPinnedChange }: NoteToolbarProps) {
  const state = view?.state ?? null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [inputPanel, setInputPanel] = useState<{ kind: ToolbarInputKind; value: string; selection: string } | null>(null);

  // The bar must stay while the heading menu OR an input panel holds it open —
  // both steal the editor's focus, and focus alone is what shows the bar.
  useEffect(() => {
    onPinnedChange(menuOpen || inputPanel !== null);
  }, [inputPanel, menuOpen, onPinnedChange]);

  // The note-header switch can hide the bar while a panel is open — the
  // panel must not outlive its bar.
  useEffect(() => {
    if (!visible) setInputPanel(null);
  }, [visible]);

  const run = (command: Command | null) => {
    if (!view || !command) return;
    command(view.state, view.dispatch);
    view.focus();
  };

  const openInput = (kind: ToolbarInputKind) => {
    if (!view) return;
    const selection = view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, " ").trim();
    // Selected text prefills where it IS the input (link target, equation);
    // for an image it stays what it always was — the caption.
    setInputPanel({ kind, selection, value: kind === "image" ? "" : selection });
  };

  const closeInput = () => {
    setInputPanel(null);
    view?.focus();
  };

  const submitInput = () => {
    if (!inputPanel) return;
    const value = inputPanel.value.trim();
    if (!value) return;
    if (inputPanel.kind === "note-link") run(insertNoteLink(value));
    else if (inputPanel.kind === "image") run(insertImage(value, inputPanel.selection));
    else run(insertEquation(value));
    setInputPanel(null);
  };

  // Rendered with KaTeX exactly like the note body will render it (same
  // trust: false contract — the markup is KaTeX's own, never the input),
  // errors shown inline instead of thrown — typing half an expression is
  // normal.
  const equationPreview = useMemo(() => {
    if (inputPanel?.kind !== "equation" || !inputPanel.value.trim()) return null;
    return katex.renderToString(inputPanel.value, { displayMode: true, throwOnError: false, trust: false });
  }, [inputPanel]);

  const blockKind = state ? currentBlockKind(state) : "paragraph";

  const buttons: { id: string; active: boolean; onClick: () => void }[] = state
    ? [
        { active: isInList(state, false), id: "bullets", onClick: () => run(noteMenuCommand("bullets")) },
        { active: isInList(state, true), id: "numbers", onClick: () => run(noteMenuCommand("numbers")) },
        { active: isInChecklist(state), id: "checklist", onClick: () => run(noteMenuCommand("checklist")) },
        { active: inputPanel?.kind === "note-link", id: "note-link", onClick: () => openInput("note-link") },
        { active: inputPanel?.kind === "image", id: "image", onClick: () => openInput("image") },
        { active: false, id: "table", onClick: () => run(noteMenuCommand("table")) },
        { active: isInCodeBlock(state), id: "code", onClick: () => run(noteMenuCommand("code")) },
        { active: inputPanel?.kind === "equation", id: "equation", onClick: () => openInput("equation") },
        { active: isInQuote(state), id: "quote", onClick: () => run(noteMenuCommand("quote")) },
      ]
    : [];

  return (
    <div className="note-toolbar-anchor" data-testid="note-toolbar-anchor">
      <div
        aria-hidden={!visible}
        className={cn("note-toolbar", !visible && "note-toolbar-hidden")}
        data-testid="note-toolbar"
        onMouseDown={(event) => event.preventDefault()}
        role="toolbar"
      >
        <DropdownMenu onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button className="note-toolbar-picker" title="Text style" type="button">
              {BLOCK_LABELS[blockKind]}
              <Codicon name="chevron-down" size="0.625rem" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-36">
            <DropdownMenuRadioGroup
              onValueChange={(value) => run(setBlockKind(value as "paragraph" | "h1" | "h2" | "h3"))}
              value={blockKind === "other" ? "" : blockKind}
            >
              <DropdownMenuRadioItem value="paragraph">Text</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="h1">Heading 1</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="h2">Heading 2</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="h3">Heading 3</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="note-toolbar-rule" />

        <ToolButton active={state ? isMarkActive(state, noteSchema.marks.strong!) : false} icon="bold" label="Bold" onClick={() => run(toggleBold)} />
        <ToolButton active={state ? isMarkActive(state, noteSchema.marks.em!) : false} icon="italic" label="Italic" onClick={() => run(toggleItalic)} />

        <span className="note-toolbar-rule" />

        {buttons.map(({ id, active, onClick }) => {
          const item = menuItem(id);
          return <ToolButton active={active} icon={item.icon} key={id} label={item.label} onClick={onClick} />;
        })}
      </div>

      {/* The input panel, right under the bar. A sibling of the pill on
          purpose: the pill swallows mousedown to protect the selection, and
          this panel needs real focus to be typed in. ProseMirror keeps the
          selection while blurred, so inserting lands where the caret was. */}
      {inputPanel && (
        <div className="note-toolbar-input" data-testid="note-toolbar-input" onKeyDown={(event) => event.stopPropagation()}>
          <label className="mb-1.5 block text-[0.6875rem] font-medium text-(--ui-text-secondary)" htmlFor="note-toolbar-input-field">
            {INPUT_COPY[inputPanel.kind].label}
          </label>
          <input
            autoFocus
            className="w-full rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-stroke-secondary)"
            id="note-toolbar-input-field"
            onChange={(event) => setInputPanel({ ...inputPanel, value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitInput();
              } else if (event.key === "Escape") {
                event.preventDefault();
                closeInput();
              }
            }}
            placeholder={INPUT_COPY[inputPanel.kind].placeholder}
            spellCheck={false}
            value={inputPanel.value}
          />
          {inputPanel.kind === "equation" && (
            <div className="note-toolbar-math-preview" data-testid="note-toolbar-math-preview">
              {equationPreview ? (
                <div dangerouslySetInnerHTML={{ __html: equationPreview }} />
              ) : (
                <span className="text-[0.6875rem] text-(--ui-text-quaternary)">The equation previews here as you type.</span>
              )}
            </div>
          )}
          <div className="mt-2 flex justify-end gap-1.5">
            <Button onClick={closeInput} size="xs" type="button" variant="ghost">Cancel</Button>
            <Button disabled={!inputPanel.value.trim()} onClick={submitInput} size="xs" type="button" variant="secondary">
              {INPUT_COPY[inputPanel.kind].cta}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn("note-toolbar-button", active && "note-toolbar-button-active")}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Codicon name={icon} size="0.8125rem" />
    </button>
  );
}
