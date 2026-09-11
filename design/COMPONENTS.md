# Components

Every value below resolves to a token in `/design/TOKENS.md`. A component containing a raw pixel
value is a bug.

**Pages compose primitives. A page that styles is a page that has drifted.**

Legend: **[have]** exists and broadly conforms. **[refactor]** exists, needs rework.
**[build]** does not exist. **[no precedent]** designed from our requirements, not measured on any
reference.

---

## 1. Foundations

### Text **[build]**
The only way to render type. Takes a scale token, never a size.

`variant`: `meta | caption | ui | ui-lg | body | body-lg | title-sm | title | display`
`tone`: `primary | secondary | muted | disabled | danger | on-accent`
`as`: element override (`p`, `span`, `label`, `div`)

Sets size, weight, line height **and tracking** together. Tracking is never set at a call site.

### Heading **[build]**
`Text` with semantics. `level` 1 to 4 maps to `display | title | title-sm | ui-lg` and renders the
matching `h1` to `h4`. **Visual level and semantic level are decoupled**: a section can be an `h2`
that looks like `ui-lg`.

### Icon **[build]**
The single icon entry point. See `/design/ICONS.md`.
`name` (Lucide), `size` 12 | 14 | 16 | 20 | 24, `tone` primary | secondary | muted | on-accent.
Always `strokeWidth={1.5}`.

### Surface **[build]**
A background plus optional border and radius. Replaces ad-hoc `div`s with a wash and a rounded
corner.
`level`: `flat | sunken | raised | floating | overlay`
`radius`: `4 | 6 | 10 | 16 | 24 | full`
`raised` is the **1px ring** (`--elev-raised`), not a drop shadow.

### Stack / Row **[build]**
Vertical and horizontal flex with a `gap` from the spacing scale only. Removes most one-off
`flex gap-[14px]` from feature code.

### Divider **[have]** (`ui/separator.tsx`)
1px at `--border-subtle`. Never two dividers within 16px of each other.

### Container **[build]**
`reading` (672px), `content` (1120px), `full`. Handles its own gutters per breakpoint.

---

## 2. Controls

### Button **[refactor]** (`ui/button.tsx` exists; 150 files use raw `<button>`)

| variant | background | text | border |
| --- | --- | --- | --- |
| `primary` | `--text-primary` (ink) | `--text-on-inverse` | none |
| `secondary` | transparent | `--text-primary` | 1px `--border-default` |
| `ghost` | transparent | `--text-secondary` | none |
| `danger` | `--danger` | white | none |

**The primary button is ink, never the accent.**

| size | height | padding | type | radius | icon |
| --- | --- | --- | --- | --- | --- |
| `sm` | 24 | 0 8 | `ui` | 6 | 14 |
| `md` | 28 | 0 12 | `ui` | 6 | 16 |
| `lg` | 32 | 0 14 | `ui-lg` | 6 | 16 |
| `content` | 36 | 0 16 | `body` | **full** | 20 |

`content` is the learner-facing size and the only pill. Chrome uses `sm` to `lg` at radius 6.

States: hover `--bg-hover` at `--dur-instant`; active `--bg-active`; focus `--focus-ring`, a 2px ink
ring with a 2px gap in the ground, drawn as a shadow (reversed 2026-09-11: it was an inset accent
ring); disabled 40% opacity and `pointer-events: none`; loading shows a spinner **and keeps its
width** so the layout does not jump.

### IconButton **[refactor]**
Square. 24 / 28 / 32 / 36 with icons 14 / 16 / 16 / 20. Radius 6, or full at `content` size.
**Requires an `aria-label`.** Tooltip after 500ms, suppressed on touch.

### Input, Textarea, Select **[refactor]** (`ui/input.tsx`, `ui/textarea.tsx` exist)
Height 32 (comfortable). Background `--bg-sunken`, border 1px `--border-default`, radius 6, type
`body` so typed content matches read content. Focus: the border goes to `--border-focus` and
`--focus-ring` is drawn outside it; **the border never changes width** (that shifts layout by a
pixel).

Placeholder `--text-muted`. Error: border `--danger`, message below in `caption`.

### SearchInput **[refactor]**
Input with a leading 16px search icon, 8px gap, and a clear button that appears once there is a
value. `⌘K` opens the command menu instead, where one exists.

### Checkbox, Radio, Toggle **[build]**
16px box (checkbox radius 4, radio full), 20px toggle. Label `ui`, 8px gap, whole row clickable.
Checked uses **ink**. Reversed 2026-09-11: checked used to be the accent, and the accent now has two
places only, the send button and the learner's own message bubble.

### SegmentedControl **[build]**
Height 28, radius 6, background `--bg-sunken`, 2px inset padding. The selected segment is
`--bg-surface` with `--elev-raised`. Selection slides at `--dur-standard`.

---

## 3. Navigation

### Sidebar / SidebarItem **[refactor]**
240px, the sunken ground `--bg-sunken`, which is the ink at 2%. Reversed 2026-09-11: this file used to
say the sidebar must not be a different colour from content, and the synthesis measured Sana's
`#f9f9f9` sidebar instead. Right hairline at `--border-subtle`.

Item: height 30, radius 6, padding `0 8`, icon 16 + 8px gap + `ui` label. Hover `--bg-hover` at
`--dur-instant`, 20ms. **Selected: `--bg-selected-neutral` plus `--text-primary`, and no accent bar at
all** (reversed 2026-09-11: the current learning position used to be allowed one). Section labels use
`label` in `--text-muted`, 24px top margin.

### TopBar **[refactor]**
48px, `--bg-page`, bottom hairline. Left: breadcrumb. Right: actions as 28px icon buttons. Never a
shadow.

### Tabs **[refactor]** (`ui/tabs.tsx` exists)
Height 32, `ui` type. Selected: `--text-primary` plus a 2px **ink** underline (reversed 2026-09-11: it
was the accent). Unselected `--text-secondary`. Underline slides at `--dur-standard`. Scrollable,
never wrapping.

### Breadcrumb **[build]**
`caption`, `--text-secondary`, last crumb `--text-primary`. Separator is a 12px chevron at
`--icon-muted`. Collapses to `…` beyond three levels.

### CommandMenu **[build]**
`⌘K`. 560px, radius 10, `--elev-overlay`. Rows 28px at radius 6, `ui`, grouped with `label`
headings. Full keyboard control. **The primary navigation path for power users**, not a decoration.

### DropdownMenu / ContextMenu **[refactor]**
Radius 10, `--elev-floating`, 4px padding. Items 28px, radius 6, padding `0 8`: 6 plus 4 of padding is
10, which is the nesting rule (2026-09-11 ruling, replacing a menu at 8 holding items at 4). Separator
is a hairline with 4px margin. Destructive items `--danger`, always last.

---

## 4. Feedback

### Tooltip **[refactor]**
`caption` on an inverted surface, radius 4, padding `4px 8px`. 500ms delay, `--dur-fast` fade.
**Suppressed on touch.** Never contains the only copy of essential information.

### Popover **[refactor]** · **Modal / Dialog [refactor]** (`ui/dialog.tsx`, `ui/sheet.tsx`)
Popover: radius 10, `--elev-floating`, 12px padding.
Dialog: max 560px, radius 24, 24px padding, `--elev-overlay` (2026-09-11 ruling: dialogs and the
composer are 24, replacing 12). Scrim is ink at 40%. Enters at `--dur-slow`, opacity plus a 4px rise,
no scale. **Becomes a bottom sheet below `md`.**

### Toast **[build]**
Bottom-right (bottom-centre on mobile), 360px, radius 10, `--elev-floating`. 5s auto-dismiss;
never auto-dismisses an error.

### Alert **[build]** · **Skeleton [have]** (`ui/skeleton.tsx`)
Alert: `--*-bg` background, 1px matching border, radius 10, 12px padding, 16px leading icon.
Skeleton: `--bg-sunken`, matches the real content's radius and line height. **Pulse only, no
shimmer sweep** (a moving gradient repaints every frame).

### EmptyState **[build]** · **ErrorState [build]**
Empty: 24px icon at `--icon-muted`, `title-sm` heading, one `body` sentence, one action. **No
illustration, no more than one sentence.** Centred in its container, never in the viewport.
Error: the same shape with `--danger` icon, the actual error, and a retry.

---

## 5. Content

### Card **[refactor]**
`--bg-surface`, radius 10, 1px `--border-default`, 16px padding. **Cards are a last resort**
(`DESIGN.md` §3). **Never nested.**

### ContentBlock **[no precedent]**
The base for anything in a document or lesson. Full reading width, 16px vertical rhythm, hover
reveals a left-margin handle at `--icon-muted`. This is the block architecture Sana gets from
BlockNote; we own ours.

### ResourceCard / FileCard **[refactor]**
Row, not a card: 48px, 20px type icon, name in `ui-lg`, meta in `caption`, actions on hover.
A grid of file *cards* is worse than a list of file *rows* for scanning.

### MediaBlock **[refactor]** · **Callout [build]** · **QuoteBlock [build]**
Media: full reading width, radius 10, caption below in `caption`/`--text-secondary`.
Callout: `--bg-sunken`, **3px left rule** (not a full border), 12px padding, radius 4 on the right
only. Variants tint the rule and the icon, never the background.
Quote: 3px left rule at `--border-strong`, 16px left padding, no italics, no quotation glyph.

---

## 6. Learning components **[all: no precedent]**

Sana Learn's course, lesson, poll and quiz surfaces were not reachable from the account available.
These are designed from our product requirements. **They are the part of this system with no
measured precedent and should be validated on screen first.**

The governing rule (`DESIGN.md` §8): each learning object gets **one** structural signal, not a
colour scheme.

The accent left this table on 2026-09-11: it has two places now, the send button and the learner's own
message bubble, so a poll fill, a selected option, a progress bar and a mastery dot are all ink.

| component | its one signal |
| --- | --- |
| **Poll** | rows with a proportional fill behind the label; result bar is `--bg-selected-neutral` |
| **QuizQuestion** | a numbered rule down the left margin |
| **MultipleChoice** | pill options, 36px, `--border-default`; selected takes an ink border (`--border-strong`) and `--bg-selected-neutral` |
| **FreeResponse** | a textarea at reading width with a word count in `meta` |
| **ReflectionPrompt** | a callout with no answer field: it asks and does not grade |
| **Flashcard** | plain Anki card, **X and check only**, no flip animation (standing owner ruling) |
| **ProgressIndicator** | 3px bar, `--bg-sunken` track, ink fill; **never a percentage number** |
| **MasteryIndicator** | a four-step dot row, filled with ink (outline form of the dot) |
| **AnswerFeedback** | a left rule in `--success` or `--danger`, plus the explanation. Never a full green or red panel |
| **TeacherPrompt** | a callout with a 16px avatar; distinguished by **attribution**, not decoration |
| **StudentResponse** | indented under its prompt with a hairline connector |

**No confetti. No score animation. No emoji reactions.**

---

## 7. Layout

### AppShell **[refactor]**
Sidebar + optional TopBar + content + optional right panel. Owns all breakpoint behaviour so no
screen implements its own responsive logic.

### SplitPane **[have]** · **InspectorPanel [refactor]** · **ContentColumn [build]**
Split: 4px drag handle, hairline at rest, `--bg-hover` on hover. Stacks below `lg`.
Inspector: 320px, `--bg-page`, left hairline. Sheet below `md`.
ContentColumn: 672px centred, gutters 16 / 24 / 32 by breakpoint. **Every reading surface uses it.**

### CourseLayout / LearningLayout **[no precedent]**
Learning: content column, chrome minimised, progress in the top bar, next/previous pinned to the
bottom. **Chrome recedes furthest here** (`DESIGN.md` §1).
