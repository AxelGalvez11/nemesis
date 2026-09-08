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
`radius`: `4 | 6 | 8 | 12 | full`
`raised` is a **border**, not a shadow.

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

States: hover `--bg-hover` at `--dur-instant`; active `--bg-active`; focus inset 2px accent ring;
disabled 40% opacity and `pointer-events: none`; loading shows a spinner **and keeps its width** so
the layout does not jump.

### IconButton **[refactor]**
Square. 24 / 28 / 32 / 36 with icons 14 / 16 / 16 / 20. Radius 6, or full at `content` size.
**Requires an `aria-label`.** Tooltip after 500ms, suppressed on touch.

### Input, Textarea, Select **[refactor]** (`ui/input.tsx`, `ui/textarea.tsx` exist)
Height 32 (comfortable). Background `--bg-sunken`, border 1px `--border-default`, radius 6, type
`body` so typed content matches read content. Focus: border goes to `--border-focus` plus the inset
ring; **the border never changes width** (that shifts layout by a pixel).

Placeholder `--text-muted`. Error: border `--danger`, message below in `caption`.

### SearchInput **[refactor]**
Input with a leading 16px search icon, 8px gap, and a clear button that appears once there is a
value. `⌘K` opens the command menu instead, where one exists.

### Checkbox, Radio, Toggle **[build]**
16px box (checkbox radius 4, radio full), 20px toggle. Label `ui`, 8px gap, whole row clickable.
Checked uses the **accent**: this is "what you have chosen", which is the accent's one job.

### SegmentedControl **[build]**
Height 28, radius 6, background `--bg-sunken`, 2px inset padding. The selected segment is
`--bg-surface` with `--elev-raised`. Selection slides at `--dur-standard`.

---

## 3. Navigation

### Sidebar / SidebarItem **[refactor]**
240px, background `--bg-page` (**not** a different colour from content: a differently-coloured
sidebar is chrome asserting itself). Right hairline at `--border-subtle`.

Item: height 28, radius 6, padding `0 8`, icon 16 + 8px gap + `ui` label. Hover `--bg-hover` at
40ms. **Selected: `--bg-active` plus `--text-primary`, no accent bar** unless it marks current
learning position. Section labels `meta` in `--text-muted`, 24px top margin.

### TopBar **[refactor]**
48px, `--bg-page`, bottom hairline. Left: breadcrumb. Right: actions as 28px icon buttons. Never a
shadow.

### Tabs **[refactor]** (`ui/tabs.tsx` exists)
Height 32, `ui` type. Selected: `--text-primary` plus a 2px accent underline. Unselected
`--text-secondary`. Underline slides at `--dur-standard`. Scrollable, never wrapping.

### Breadcrumb **[build]**
`caption`, `--text-secondary`, last crumb `--text-primary`. Separator is a 12px chevron at
`--icon-muted`. Collapses to `…` beyond three levels.

### CommandMenu **[build]**
`⌘K`. 560px, radius 12, `--elev-overlay`. Rows 32px, `ui`, grouped with `meta` headings. Full
keyboard control. **The primary navigation path for power users**, not a decoration.

### DropdownMenu / ContextMenu **[refactor]**
Radius 8, `--elev-overlay`, 4px padding. Items 28px, radius 4, padding `0 8`. Separator is a
hairline with 4px margin. Destructive items `--danger`, always last.

---

## 4. Feedback

### Tooltip **[refactor]**
`caption` on an inverted surface, radius 4, padding `4px 8px`. 500ms delay, `--dur-fast` fade.
**Suppressed on touch.** Never contains the only copy of essential information.

### Popover **[refactor]** · **Modal / Dialog [refactor]** (`ui/dialog.tsx`, `ui/sheet.tsx`)
Popover: radius 8, `--elev-overlay`, 12px padding.
Dialog: max 560px, radius 12, 24px padding, `--elev-overlay`. Scrim is ink at 40%. Enters at
`--dur-slow`, opacity plus a 4px rise, no scale. **Becomes a bottom sheet below `md`.**

### Toast **[build]**
Bottom-right (bottom-centre on mobile), 360px, radius 8, `--elev-floating`. 5s auto-dismiss;
never auto-dismisses an error.

### Alert **[build]** · **Skeleton [have]** (`ui/skeleton.tsx`)
Alert: `--*-bg` background, 1px matching border, radius 8, 12px padding, 16px leading icon.
Skeleton: `--bg-sunken`, matches the real content's radius and line height. **Pulse only, no
shimmer sweep** (a moving gradient repaints every frame).

### EmptyState **[build]** · **ErrorState [build]**
Empty: 24px icon at `--icon-muted`, `title-sm` heading, one `body` sentence, one action. **No
illustration, no more than one sentence.** Centred in its container, never in the viewport.
Error: the same shape with `--danger` icon, the actual error, and a retry.

---

## 5. Content

### Card **[refactor]**
`--bg-surface`, radius 8, 1px `--border-default`, 16px padding. **Cards are a last resort**
(`DESIGN.md` §3). **Never nested.**

### ContentBlock **[no precedent]**
The base for anything in a document or lesson. Full reading width, 16px vertical rhythm, hover
reveals a left-margin handle at `--icon-muted`. This is the block architecture Sana gets from
BlockNote; we own ours.

### ResourceCard / FileCard **[refactor]**
Row, not a card: 48px, 20px type icon, name in `ui-lg`, meta in `caption`, actions on hover.
A grid of file *cards* is worse than a list of file *rows* for scanning.

### MediaBlock **[refactor]** · **Callout [build]** · **QuoteBlock [build]**
Media: full reading width, radius 8, caption below in `caption`/`--text-secondary`.
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

| component | its one signal |
| --- | --- |
| **Poll** | rows with a proportional fill behind the label; result bar is `--accent-subtle` |
| **QuizQuestion** | a numbered rule down the left margin |
| **MultipleChoice** | pill options, 36px, `--border-default`; selected takes the accent border and `--bg-selected` |
| **FreeResponse** | a textarea at reading width with a word count in `meta` |
| **ReflectionPrompt** | a callout with no answer field: it asks and does not grade |
| **Flashcard** | plain Anki card, **X and check only**, no flip animation (standing owner ruling) |
| **ProgressIndicator** | 3px bar, `--bg-sunken` track, accent fill; **never a percentage number** |
| **MasteryIndicator** | a four-step dot row, filled with accent (outline form of the dot) |
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
