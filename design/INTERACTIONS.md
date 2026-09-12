# Interactions

## Hover

A hover background responds at **20ms**, effectively instantly. Background and border only; a hover
that moves, scales or lifts something is decoration.

The rest of the ladder, set on 2026-09-11 in place of the single 40ms figure this file used to quote:
quick changes (colour, opacity, icon state) take 100ms, menus open in 150ms, fades and rotations take
200ms, and a panel travels in 320ms on `cubic-bezier(.32,.72,0,1)`. The closer a change is to the
pointer, the faster it resolves. Full table in [MOTION.md](MOTION.md).

**Hover-revealed controls are permitted only where a keyboard and touch path also exists.** Below
`md` they are always visible. `opacity: 0` must always carry `pointer-events: none`: an invisible
control that still takes presses is a bug we have shipped before.

## Focus

A **2px ink ring with a 2px gap in the ground** (`--focus-ring`), drawn as a box-shadow so it costs no
layout and cannot shift a row when it appears. The gap is what keeps the ring legible on a filled
control. Reversed 2026-09-11: it was an inset accent ring, and focus is ink now because the accent has
two places only. Every interactive element has one. `:focus-visible`, not `:focus`, so a mouse click
does not draw it.

Tab order follows visual order. A dialog traps focus and returns it to the trigger on close.

## Selection

Single click selects, and selection is `--bg-selected-neutral` plus an **ink** border (reversed
2026-09-11: the border was the accent). Multi-select is shift-click for a range, cmd/ctrl-click for
individual items, drag for a marquee on canvas. Escape clears. A selection count appears in the
toolbar, not as a floating bar over content.

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
and a preview follows the pointer at `--elev-floating`. Drop targets show a 2px ink line for
insertion, or `--bg-selected-neutral` for containment. **Everything draggable is also movable by
keyboard.**

## Progressive disclosure

Secondary actions live in an overflow menu, not spread across the toolbar. A toolbar shows what is
used most; the menu holds the rest. If a toolbar has more than seven controls, it needs an overflow.

## Reversible state

**Any state a person can switch off must be switchable back on from every screen that state is
visible from.** A control that only one screen draws is not that. When the state is saved to the
account, a missing control is a lock rather than an inconvenience: the next sign-in lands wherever
the app sends people, and the state is still off.

Set on 2026-09-11, after the owner closed the sidebar on the live app and could not get it back. The
sidebar's `collapsed` is saved per account (`ws_user_settings`), and the one control that reopened it
lived in the page top bar. The chat screen draws its own bar, All notes and Templates draw an empty
one, and Canvas, Review and the calendar are the React app's column with no Space bar at all.
Signing in lands on the chat screen, so one click on "Close sidebar" left no visible way back on any
screen, across reloads. The control is drawn once for the whole app now, into `.nsp-over`, a fixed
layer above the React column that passes through every click it is not carrying. A screen cannot
leave out what no screen draws. Guarded by `apps/web/lib/space/space-sidebar.test.ts`.

**A keyboard shortcut is not the way back.** `⌘\` toggled the sidebar throughout, and the Keyboard
rule above says why that counted for nothing: a shortcut nobody has been shown does not exist. A
shortcut is the fast path beside a control a person can see, never instead of one.

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
