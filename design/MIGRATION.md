# Migration

Classification of the existing application against `/design/`. Measured on `main` at `3e40f59a`.

**Nothing here rewrites business logic.** Visual-system changes ship separately from behaviour
changes, in their own commits, so a regression is attributable.

---

## Keep

Already correct. Do not touch.

- **Neutrals built as alpha over one ink.** `--ui-text-primary` is
  `color-mix(in srgb, var(--ui-base) 100%, transparent)`, `--ui-stroke-primary` is 18%. This is the
  best idea in the entire reference set and we already had it. Three of five references arrived at
  the same construction independently.
- **Semantic token names.** `--ui-text-primary`, `--ui-bg-elevated`, `--ui-stroke-secondary` are
  already role-first and self-documenting. They need consolidating, not replacing.
- **No emoji as interface icons.** Verified: zero in JSX. The 204 files matching an emoji scan were
  code comments.
- **The inset focus ring** where it already exists on the board.
- **`ui/skeleton.tsx`, `ui/separator.tsx`, `ui/scroll-area.tsx`, `ui/tabs.tsx`** as component
  architecture.
- **The character's motion vocabulary.** Separate system, owns its own rules, out of scope.
- **The dot lattice work** just landed (#1187). Its tokens are measured and correct.

## Refactor

Behaviour is right; styling or architecture is wrong.

| what | problem | action |
| --- | --- | --- |
| `ui/button.tsx` | exists but **150 files use a raw `<button>`** | rebuild to the variant/size matrix, then migrate callers |
| `ui/input.tsx`, `textarea.tsx` | not on the control-height scale | 32px, radius 6, `body` type |
| `ui/card.tsx` | used as the default container | reduce to a last-resort primitive; most callers become sections |
| `ui/dialog.tsx`, `sheet.tsx` | radius and elevation off-system | radius 12, `--elev-overlay`, bottom sheet below `md` |
| sidebar and rows | heights and radii vary per call site | 28px, radius 6, `ui` type |
| canvas toolbar | landing-page proportions on a working surface | chrome density: 28px controls, radius 6, 12px type |
| every `text-[Npx]` | **24 distinct sizes, 401 uses** | `<Text variant>` |
| every `rounded-[Npx]` | **26 distinct radii, 246 uses** | six radius tokens |
| every arbitrary spacing | **210 distinct values, 1,142 uses** | twelve-step scale |
| 555 shadow uses | mostly tight shadows | border first; two elevations only |
| 186 gradients | mostly decorative | delete unless load-bearing |
| 168 `backdrop-blur` | mostly decorative | genuine overlays only |
| 160 `font-bold` | weight 700 | cap at 600 |
| 14 sparkle icons | AI-as-decoration | remove |

## Consolidate

Many implementations, one concept.

- **Buttons**: `ui/button.tsx` plus 150 files of raw `<button>` → one `Button` and one `IconButton`.
- **Background tokens**: `--ui-bg`, `--ui-bg-base`, `--ui-bg-primary` → `--bg-page`.
- **Border tokens**: `--ui-border`, `--ui-border-faint`, `--ui-stroke-primary`,
  `--ui-stroke-secondary`, `--ui-stroke-tertiary`, `--ui-stroke-quaternary` → three border tokens.
- **Surface tokens**: `--ui-surface-background`, `--ui-bg-card`, `--ui-bg-elevated`,
  `--ui-editor-surface-background`, `--ui-sidebar-surface-background`, `--ui-chat-surface-background`
  → `--bg-surface` plus `--bg-sunken`.
- **Hues**: eight named colours plus eight `--ui-kind-*` → three status colours plus one accent.
- **Icon libraries**: lucide (28 files) and tabler (22 files) → Lucide only, through `<Icon />`.
- **Panels**: the reading pane, sources panel and inspector are three implementations of one
  docked-panel idea → one `InspectorPanel`.

## Remove

- `@tabler/icons-react` (dependency and all 22 imports)
- decorative gradients and blurs that survive the audit with no function
- the tight `0 1px 2px` shadow pattern
- radius values above 12px that are not pills or the composer
- any `--ui-kind-*` colour not carrying meaning

## Redesign

Substantial restructuring, in this order.

1. **Canvas chrome** (toolbar, rails, panels). Currently landing-page proportions on a working
   surface. The largest single visual win.
2. **The reading pane / sources / inspector trio.** Three panels, one idea.
3. **Library and shelf pages.** Grids of cards that should mostly be rows.
4. **Study and flashcard surfaces.** Bring under the learning-component language.
5. **Settings.** Currently the most generic surface in the product.

---

## Order of implementation

Primitives first. **Do not redesign a page before the primitives it needs exist.**

1. **Tokens** in `globals.css`, with old `--ui-*` names aliased to new ones so nothing breaks
2. **Guard tests** that fail on arbitrary values, so the count cannot grow while we work
3. **Typography**: `Text`, `Heading`
4. **Icons**: `Icon`, Lucide only, stroke 1.5
5. **Controls**: `Button`, `IconButton`, `Input`, `Select`, `Checkbox`, `Toggle`, `SegmentedControl`
6. **Surfaces**: `Surface`, `Stack`, `Row`, `Container`, `Card`
7. **Navigation**: `Sidebar`, `SidebarItem`, `TopBar`, `Tabs`, `Breadcrumb`, `CommandMenu`
8. **Overlays**: `DropdownMenu`, `ContextMenu`, `Popover`, `Dialog`, `Toast`, `Tooltip`
9. **Learning components** (no measured precedent: validate these on screen first)
10. **Layouts**, then **pages**

## The guards

Counts are the yardstick. Each guard starts as a ceiling at today's number and ratchets down; a
change that raises a count fails.

| guard | today | target |
| --- | --- | --- |
| distinct `text-[Npx]` | 24 | **0** |
| distinct `rounded-[Npx]` | 26 | **0** |
| distinct arbitrary spacing | 210 | **0** |
| files with raw `<button>` | 150 | **0** |
| icon libraries | 2 | **1** |
| weight 700+ | 160 | **0** |

A ratcheting ceiling is the only mechanism that survives a deadline. Review does not.
