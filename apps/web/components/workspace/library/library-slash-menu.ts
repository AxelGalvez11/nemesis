// CodeMirror glue for the "/" menu. All the deciding lives in
// lib/workspace/library-commands.ts; this file only asks the editor what is
// under the caret and applies the answer.
//
// Registered through the markdown language's own `languageData` rather than a
// second `autocompletion()` call: basicSetup already installs one, and a
// competing config would fight it for the popup and the keymap. This way the
// existing menu — its arrow keys, its Enter, its Escape, its styling — is what
// the student gets.

import { syntaxTree } from "@codemirror/language";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";

import { commandCaretOffset, LIBRARY_COMMANDS, matchLibraryCommands, slashTriggerAt } from "@/lib/workspace/library-commands";

/** Nodes where a "/" is content, not a command. */
const CODE_NODES = new Set(["FencedCode", "CodeBlock", "InlineCode", "CodeText", "Comment"]);

function insideCode(context: CompletionContext): boolean {
  let node = syntaxTree(context.state).resolveInner(context.pos, -1);
  while (node.parent) {
    if (CODE_NODES.has(node.name)) return true;
    node = node.parent;
  }
  return CODE_NODES.has(node.name);
}

export function slashCommandSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const trigger = slashTriggerAt(line.text, context.pos - line.from);
  if (!trigger) return null;
  // Typing "/" inside a code block means a slash. The pure trigger cannot know
  // that — it only sees the line — so the tree is consulted here.
  if (insideCode(context)) return null;

  const matches = matchLibraryCommands(trigger.query);
  if (!matches.length) return null;

  const from = line.from + trigger.from;
  const options: Completion[] = matches.map((command, index) => ({
    // The menu sorts by boost, and the catalogue order is the useful order
    // (headings, then lists, then blocks) — so preserve it explicitly.
    boost: matches.length - index,
    apply: (view, _completion, applyFrom, applyTo) => {
      view.dispatch({
        changes: { from: applyFrom, insert: command.insert, to: applyTo },
        scrollIntoView: true,
        selection: { anchor: applyFrom + commandCaretOffset(command) },
        userEvent: "input.complete",
      });
    },
    detail: command.hint,
    label: command.label,
    section: command.group,
    type: "keyword",
  }));

  return {
    from,
    options,
    // Re-run on every keystroke in the token so the list narrows as they type;
    // anything outside it (a space, moving away) closes the menu.
    validFor: /^\/[\p{L}\d-]*$/u,
  };
}

/** Registered on the markdown language so it composes with basicSetup's own
 *  autocompletion rather than replacing it. */
export const slashCommandsData = { autocomplete: slashCommandSource };

/** Exported for the menu's own smoke test — the catalogue is the contract. */
export const slashCommandCount = LIBRARY_COMMANDS.length;
