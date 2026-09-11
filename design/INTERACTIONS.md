# Interactions

## Hover

Chrome responds at **40ms**, effectively instantly. Background and border only; a hover that moves,
scales or lifts something is decoration.

**Hover-revealed controls are permitted only where a keyboard and touch path also exists.** Below
`md` they are always visible. `opacity: 0` must always carry `pointer-events: none`: an invisible
control that still takes presses is a bug we have shipped before.

## Focus

An **inset 2px accent ring**, held transparent when unfocused so it costs no layout and cannot shift
a row when it appears. Every interactive element has one. `:focus-visible`, not `:focus`, so a mouse
click does not draw it.

Tab order follows visual order. A dialog traps focus and returns it to the trigger on close.

## Selection

Single click selects, and selection is `--bg-selected` plus an accent border. Multi-select is
shift-click for a range, cmd/ctrl-click for individual items, drag for a marquee on canvas.
Escape clears. A selection count appears in the toolbar, not as a floating bar over content.

## Keyboard

| shortcut | action |
| --- | --- |
| `⌘K` | command menu |
| `⌘F` | find in view |
| `Esc` | close overlay, clear selection, exit fullscreen (in that order) |
| `⌘Enter` | submit the composer |
| `↑ ↓` | move through lists and menus |
| `Tab` | next control, never a trap outside a dialog |
| `⌘\` | toggle the sidebar |

Every shortcut is discoverable in the command menu with its key shown. A shortcut that exists only
in the code does not exist.

## Inline editing

Click a title to edit it in place; the field inherits the text's own type so nothing reflows on
entry. Enter commits, Escape reverts, blur commits. **No separate edit mode, no pencil icon.**

## Drag and drop

Grab cursor on the handle, `grabbing` while dragging. The dragged item goes to 40% opacity in place
and a preview follows the pointer at `--elev-floating`. Drop targets show a 2px accent line for
insertion, or `--bg-selected` for containment. **Everything draggable is also movable by keyboard.**

## Progressive disclosure

Secondary actions live in an overflow menu, not spread across the toolbar. A toolbar shows what is
used most; the menu holds the rest. If a toolbar has more than seven controls, it needs an overflow.

## Loading

- Under 200ms: nothing. A spinner that flashes is worse than no spinner.
- 200ms to 1s: a skeleton matching the real content's shape.
- Over 1s: a skeleton plus a description of what is happening.
- **A button that is loading keeps its width.**

Never a full-page spinner where a skeleton would do. Never block the whole interface for a regional
update.

## Destructive actions

Confirm only when the action is genuinely irreversible. Prefer **undo** over confirmation: a toast
with an undo affordance is better than a dialog nobody reads. Destructive menu items are `--danger`
and always last, after a separator.

## Empty states

One 24px icon, one `title-sm` line, one `body` sentence, one action. **No illustration.** An empty
state explains what would be here and how to put something here.
