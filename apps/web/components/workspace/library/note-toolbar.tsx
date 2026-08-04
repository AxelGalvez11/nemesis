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

import type { EditorView } from "prosemirror-view";
import type { Command } from "prosemirror-state";

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

function menuItem(id: string) {
  const item = NOTE_MENU.find((entry) => entry.id === id);
  if (!item) throw new Error(`note menu is missing ${id}`);
  return item;
}

export function NoteToolbar({ view, visible, onPinnedChange }: NoteToolbarProps) {
  const state = view?.state ?? null;

  const run = (command: Command | null) => {
    if (!view || !command) return;
    command(view.state, view.dispatch);
    view.focus();
  };

  /** Commands that need something typed collect it via a plain prompt — the
   *  same pattern the tree's move/rename already use. Cancel does nothing. */
  const runWithInput = (id: "note-link" | "image" | "equation") => {
    if (!view) return;
    const selection = view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, " ").trim();
    if (id === "note-link") {
      const target = selection || window.prompt("Link to which note?")?.trim();
      if (target) run(insertNoteLink(target));
      return;
    }
    if (id === "image") {
      const src = window.prompt("Image address (URL):")?.trim();
      if (src) run(insertImage(src, selection));
      return;
    }
    const latex = window.prompt("Equation (LaTeX):")?.trim();
    if (latex) run(insertEquation(latex));
  };

  const blockKind = state ? currentBlockKind(state) : "paragraph";

  const buttons: { id: string; active: boolean; onClick: () => void }[] = state
    ? [
        { active: isInList(state, false), id: "bullets", onClick: () => run(noteMenuCommand("bullets")) },
        { active: isInList(state, true), id: "numbers", onClick: () => run(noteMenuCommand("numbers")) },
        { active: isInChecklist(state), id: "checklist", onClick: () => run(noteMenuCommand("checklist")) },
        { active: false, id: "note-link", onClick: () => runWithInput("note-link") },
        { active: false, id: "image", onClick: () => runWithInput("image") },
        { active: false, id: "table", onClick: () => run(noteMenuCommand("table")) },
        { active: isInCodeBlock(state), id: "code", onClick: () => run(noteMenuCommand("code")) },
        { active: false, id: "equation", onClick: () => runWithInput("equation") },
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
        <DropdownMenu onOpenChange={onPinnedChange}>
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
