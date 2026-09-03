# Google Calendar reference — MEASURED off the live signed-in app, 2026-09-01, viewport 1440x783

> 🔴 WHY THIS FILE IS IN THE REPO. The owner's acceptance condition for the calendar was
> *"pull up the actual google calendar because it all needs to match one to one so we have a
> google base to work from"*. Every value below is a real `getComputedStyle` /
> `getBoundingClientRect` call, or a literal CSS rule read out of Google's own stylesheet on
> calendar.google.com while signed in. Nothing here was read off a screenshot or estimated by eye.
>
> To check our side against it, start the web app and run the harness from the repo root:
>
>     node measure-calendar.mjs "http://localhost:<port>/calendar"
>
> It probes the same properties on our grid, prints an expected-vs-got table and exits non-zero on
> any mismatch. Expectations are stored in Google's px AND in the ratio-converted px this app
> should draw (see section 8) — the harness checks the converted column.
>
> 🔴 MEASURE AT A KNOWN DENSITY. `--cal-timed-grid-cell-height` is a variable with SEVEN values
> (section 6). The account this was taken from carries no zoom class on `<body>`, so everything
> here is Google's DEFAULT density. Re-check `document.body.className` before trusting a
> re-measurement; a body class silently rescales the entire grid.
>
> 🔴 SCREENSHOTS ARE SCALED IN THIS ENVIRONMENT. The capture comes back 1494x812 for a 1440x783
> viewport (~1.037x). Reading a pixel off the image gives you a number that is 4% wrong, which is
> exactly the size of the mistakes this file exists to prevent. Measure in the page.
>
> Re-measure rather than trust this file if the reference has visibly changed; note the date above.

## 1. COLOUR TOKENS

Google drives the whole grid off CSS custom properties. These are the ones the calendar surface
actually consumes.

| token | value | what it paints |
|---|---|---|
| `--gm3-sys-color-surface-container-highest` | `#dde3ea` | **every grid line** — hour rules, column rules, top edge |
| `--gm3-sys-color-surface` | `#ffffff` | page ground, event block ground, last column's rule |
| `--gm3-sys-color-surface-container-low` | `#f8fafd` | |
| `--gm3-sys-color-surface-container` | `#f0f4f9` | |
| `--gm3-sys-color-surface-container-high` | `#e9eef6` | |
| `--gm3-sys-color-on-surface` | `#1f1f1f` | date numbers (today and future), event titles |
| `--gm3-sys-color-on-surface-variant` | `#444746` | hour labels, weekday labels, **past** date numbers |
| `--gm3-sys-color-primary` | `#0b57d0` | today's disc, today's weekday label |
| `--gm3-sys-color-on-primary` | `#ffffff` | today's date numeral |
| `--gm3-sys-color-outline` | `#747775` | |
| `--gm3-sys-color-outline-variant` | `#c4c7c5` | |
| `--cal-sys-color-now-indicator` | `#db372d` | the now line and its dot |
| `--cal-sys-color-scrollbar` | `#e3e3e3` | (hover `#c7c7c7`, active `#ababab`) |
| `--cal-timed-grid-cell-height` | `48px` | **the one density knob** |

Note there is exactly ONE line colour. Google does not use a lighter rule for the hour and a
darker one for the day boundary; both are `#dde3ea` at 1px.

## 2. TYPE

Two families, used for different jobs:

- `"Google Sans", Roboto, Arial, sans-serif` — the view title and the big date numerals.
- `"Google Sans Text", "Google Sans", Helvetica, Arial, sans-serif` — weekday labels and all
  event text.

| element | size | line-height | weight | letter-spacing | colour |
|---|---|---|---|---|---|
| view title (`Aug – Sep 2026`) | 22px | 28px | 400 | normal | `#1f1f1f` |
| weekday (`SUN`) | 11px | 32px | 500 | **0.8px** | `#444746` / today `#0b57d0` |
| date numeral | 26px | 46px | 400 | normal | `#1f1f1f`, past `#444746` |
| date numeral, today | **25px** | 46px | 400 | normal | `#ffffff` |
| hour label (`1 AM`) | 11px | 16px | 500 | 0.1px | `#444746` |
| `GMT-05` | 11px | 24px | 500 | — | `#444746` |
| event title | 12px (`0.75rem`) | 15px | 500 | `0.00625rem` | `#1f1f1f` |
| event time (`9am`) | 12px | 15px | **400** | `0.00625rem` | `#1f1f1f` |

Today's numeral is 25px against 26px for every other day — a real 1px difference, not a rounding
artefact. The hour label has no separate "AM/PM" size; it is one run of text.

## 3. LAYOUT — the frame

| region | value |
|---|---|
| top bar height | 64px |
| sidebar width | 256px |
| gap between sidebar and grid | 8px (grid region starts at x=264) |
| header band (weekday + date + all-day) | 84px tall, y 64 → 148 |
| scrolling grid region | y 148 → 767 |
| grid scrollbar | 16px |

The header band does not scroll. The hour gutter and the day columns are two separate scroll
containers kept in sync, so the gutter cannot drift from its rows.

## 4. LAYOUT — the grid

| part | value |
|---|---|
| **hour row height** | **48px** (`--cal-timed-grid-cell-height`) |
| full day | 24 x 48 = 1152px, +1px top border = 1153px |
| hour gutter width | 51.1px |
| gutter cell | `padding-right: 8px; text-align: right` |
| hour label offset | `position: relative; top: -6px` — the label straddles its own rule |
| **12 AM label** | **not drawn** — `.XsRa1c:first-child > .wO6pL { display: none }` |
| spacer, gutter to first column | `width: 8px` + `1px` right border = 9px |
| day column | `flex: 1 1 auto; padding-right: 12px; box-sizing: border-box` |
| day column at 1440px | 146.8px (content box 133.8px) |
| column rule | `border-right: 1px solid #dde3ea` |
| **last column's rule** | `border-right: 1px solid #ffffff` — the grid does **not** close on the right |
| narrow-viewport column widths | 129px / 91px / 81px |

The hour rules are one continuous line across all seven columns, drawn from a zero-width ruling
column rather than per day cell:

```css
.aLC8Le { border-top: var(--gm3-sys-color-surface-container-highest) 1px solid; }
.sJ9Raf { height: var(--cal-timed-grid-cell-height); }
.sJ9Raf::after {
  content: ""; border-bottom: var(--gm3-sys-color-surface-container-highest) 1px solid;
  position: absolute; width: 100%; margin-top: -1px; z-index: 3; pointer-events: none;
}
```

**There is no half-hour rule.** Google draws the hour only.

## 5. THE PARTS

### Day heading
Stacked: small uppercase weekday over a large numeral. Today's numeral sits in a **46 x 46**
disc, `border-radius: 9999px`, filled `#0b57d0`. Every other day's disc is transparent and the
same 46px box, so nothing shifts when today moves.

Past days are dimmed to `#444746`; today and future days are `#1f1f1f`. Verified across all seven
columns in a week that straddles a month boundary — the dimming tracks **past vs future**, not
which month the day belongs to.

### Now indicator
```css
.rGFpCd { border-top: var(--cal-sys-color-now-indicator) solid 2px;
          position: absolute; z-index: 507; left: 0; right: 0; pointer-events: none; }
.LvQ60d { background: var(--cal-sys-color-now-indicator); border-radius: 9999px;
          position: absolute; height: 12px; width: 12px;
          margin-left: -6.5px; margin-top: -5px; z-index: 507; }
```
The line spans **only today's column**, not the whole week. The dot hangs off its left edge into
the gutter. Both are 2px/12px at `#db372d`.

### Event block
```css
.GTG3wb { position: absolute; border-radius: 6px; background-color: #fff;
          margin-left: -1px; margin-top: 1px; outline: none; }
.lhydbb { font-size: 0.75rem; letter-spacing: 0.00625rem; line-height: 15px;
          overflow: hidden; white-space: nowrap; }
.lhydbb.RIOtYe { font-weight: 500; padding-top: 4px; }
.lhydbb.RIOtYe.PKhkGc { padding-right: 8px; }
.lhydbb.RIOtYe.cpCWFd .EWOIrf { font-weight: 400; }   /* the time reads lighter than the title */
.xJqpJe { display: inline; margin-right: 4px; }        /* 16 x 16 calendar colour square */
.lhydbb.RIOtYe.PKhkGc .KcY3wb.ay3pEe { max-width: calc(100% - 24px); }
```
Radius **6px**. The block is pulled 1px left and 1px down so it sits over the column rule rather
than beside it. Cancelled events get `text-decoration: line-through`; declined ones `opacity: 0.5`.

### All-day / stacked chips
Read from CSS — the reference week had no all-day events to measure live.

| variant | container | chip |
|---|---|---|
| default | 24px | 22px |
| compact (`body.Defj0e`) | 20px | 18px |
| dense picker | 16px | 16px |

## 6. THE DENSITY LADDER

`--cal-timed-grid-cell-height` is the only thing that changes when a user rescales the grid:

| body class | row height |
|---|---|
| `Defj0e` (compact) | 40px |
| *(none — default)* | **48px** |
| `pYUZC` | 60px |
| `S41gDb` | 72px |
| `HhgIGf` | 80px |
| `F6WJbb` | 96px |
| `bRNiic` | 116px |

Compact also tightens the event chip: `padding-top: 4px` becomes `2px`, and the stacked chip
drops 22px to 18px. Nothing else in the grid moves.

## 7. WHAT GOOGLE DOES *NOT* DO

Worth writing down, because each of these is a thing it is tempting to add:

- No half-hour rule.
- No right-hand border on the last day column.
- No `12 AM` label.
- No second line colour — one `#dde3ea` at 1px for every rule on the surface.
- No weekend tint. Saturday and Sunday are the same ground as Tuesday.
- No hour-row striping.

## 8. CONVERTING TO THIS APP

🔴 **This app's root is 18px** (`html { font-size: 112.5% }` in `apps/web/app/globals.css:530`),
against Google's 16px. Ratio **1.125**.

Copy the *rem* value, not the pixel — that is what keeps the header in proportion when a student
changes their text size, and it is what Google itself does (`.lhydbb { font-size: 0.75rem }`).

| thing | Google px | in rem | this app should draw |
|---|---|---|---|
| hour row | 48 | 3rem | **54px** |
| hour gutter | 51.1 | 3.1875rem | 57.5px |
| hour label | 11 | 0.6875rem | 12.4px |
| weekday label | 11 | **0.6111rem** | **11px** (see below) |
| date numeral | 26 | **1.4444rem** | **26px** (see below) |
| today disc | 46 | **2.5556rem** | **46px** (see below) |
| event title | 12 | 0.75rem | 13.5px |
| event radius | 6 | 0.375rem | 6.75px |
| column padding-right | 12 | 0.75rem | 13.5px |
| now line | 2 | — | 2px (keep — a hairline is a hairline) |
| now dot | 12 | 0.75rem | 13.5px |
| grid rule | 1 | — | 1px (keep) |

## 9. DELIBERATELY NOT COPIED

Two of Google's colours are not ours to take, for a reason that predates this measurement:

| Google | ours | why |
|---|---|---|
| now indicator `#db372d` | `--theme-primary` (a neutral) | This app has ONE accent, the character's. `--theme-primary` was retired to a neutral by the owner on 2026-07-28 (`globals.css:139`), and a red that agrees with nothing else on the page is exactly what that ruling removed. |
| today's disc `#0b57d0` | the app foreground | Same ruling. |

What IS copied from Google here is the *relationship*: one saturated mark for now, one filled disc for
today, nothing else on the surface competing with them.

## 10. WHERE WE STAND, 2026-09-01 — MATCHED

`node measure-calendar.mjs` against `/dev-preview/calendar-week`: **0 mismatches.** Every property
below is Google's, converted to this app's root.

| property | Google, converted | ours |
|---|---|---|
| hour row height | 54px | 54px |
| hour gutter width | 57.5px | 57.4px |
| hour label font-size / weight | 12.4px / 500 | same |
| weekday font-size / weight / case | 12.4px / 500 / upper | same |
| weekday letter-spacing | 0.9px | 0.9px |
| date numeral | 29.3px | 29.3px |
| today disc | 51.8px | 51.8px |
| event radius | 6.8px | 6.8px |
| event title font-size | 13.5px | 13.5px |
| grid rule | 1px, 13% dark | 1px, 12% dark (`--ui-stroke-secondary`) |
| now line / dot | 2px / 13.5px | 2px / 13.5px |
| half-hour rules | 0 | 0 |

Structure matched at the same time, none of it measurable as a single number:

- the hour rules are one continuous line across the week, in ONE colour, at the weight Google uses
  (it was `--ui-stroke-quaternary` at 5%, less than half Google's, so the grid barely read);
- columns are ruled on the RIGHT with the last one's rule transparent, so the week no longer closes
  with a line down its edge;
- a 9px lead lane sits between the gutter and Sunday, ruled on its right, as Google's `.EDDeke`;
- each column keeps a 13.5px clear lane on its right, and blocks are inset into it;
- the midnight label is not drawn, and midday reads `12 PM` rather than `Noon`;
- hour labels straddle their own rule (Google's `top: -6px`, converted), one uniform run of text
  rather than a number with a smaller suffix beside it;
- past date numerals dim to the secondary text colour, today and later stay at full strength;
- every block tier sets its text at one size — Google shrinks the LAYOUT as a block gets shorter,
  never the type, and ours used to shrink both.

🔴 TWO OF THOSE GAPS CAME FROM ARITHMETIC, NOT TASTE, and both were written down as measurements:

1. `time-grid.ts` said *"MEASURED against Google Calendar side by side: its rows are 24px on a 16px
   root"*. Google's rows are **48px**. The reading was half the real value, taken from a hidden
   duplicate of the hour labels that Google renders offscreen.
2. Both files said *"this app's root is 20px"*. It is **18px** (`globals.css:530`). Every ratio
   conversion done from that number was 11% out.

## 11. MEASURING THE PREVIEW: ONE TRAP

🔴 `/dev-preview/calendar-week` MUST carry `data-workspace` on a wrapper. `styles/legacy.css:12`
carries an **unlayered** rule:

```css
button:where(:not([data-workspace] *)) { font: inherit; border-radius: 999px; background: var(--acid); ... }
```

Unlayered CSS beats everything in `@layer utilities`, so without that stamp every event chip renders
at the page's body size with a pill corner and the wrong ground — and a harness pointed at it reports
that the PRODUCT is wrong when only the preview is. This cost a false reading once already: the
event title measured 15.5px and was reported as "larger than Google" when the real value under the
stamp is 13.5px, exactly Google's.

## 12. WHAT IS STILL NOT GOOGLE, ON PURPOSE

Only two things, both colours, both settled before this work (see section 9): the now indicator and
today's disc are this app's neutral rather than Google's `#db372d` and `#0b57d0`, because
`--theme-primary` was retired to a neutral on 2026-07-28 and the product has one accent.
Their SIZE, WEIGHT and PLACEMENT are Google's exactly.

### Added 2026-09-01

**The weekday line box is 1.5rem, not Google's 2rem.** Owner: *"the weekday row is
a tad bit too big."* The numeral and its 46px disc below are still Google's
exactly; the row simply loses 9px above them. This is the only place the header
knowingly leaves the reference.

> **Superseded 2026-09-03** — see below. The row is Google's absolute size now,
> and the 1.5rem line box is gone with the rest of the ratio conversion.

### Added 2026-09-03 — the day header copies Google's SIZE, not its proportion

Owner, third report on this one row: *"the weekday row still feels a bit too big,
it needs to be smaller, better fitted — just compare with Google Calendar please."*

**Trimming the band again would not have fixed it, because the band was already
right.** Measured on both sides that day, at a 1470px window:

| | Google | ours (before) | ours (after) |
|---|---|---|---|
| day-header band | **84px** | 85.5px | **83.98px** |
| weekday label | 11px / 32px / 0.8px | 12.375px / 27px / 0.9px | **11px / 32px / 0.8px** |
| date numeral | 26px | 29.25px | **26px** |
| today's disc | 46.58px | 51.75px | **46px** |

Everything INSIDE the band was 12.5% too big, and the band matched only because
the 2026-09-01 pass had cut the label's line box 9px BELOW Google's to compensate.
A too-large numeral in a too-short row is not the reference; it is two errors
cancelling in one dimension.

🔴 **So this one block inverts the conversion: Google's pixels ÷ OUR root (18),
not × the ratio.** 11/18, 32/18, 26/18, 46/18. The drawn object then lands on
Google's exactly and still scales with the student's text size, which was the
whole reason for using rem in the first place.

🔴 **The grid keeps the ratio conversion, on purpose.** The owner said the grid
and the events look right and reported only this row. Do not "finish the job" by
putting the hour rows on Google's 48px — that is a different change, and the
table above now says which surface uses which conversion so the two cannot be
confused for a mistake.

**Label colour was a MISS, not a deviation, and is now fixed.** Google's hour and
weekday labels are `#444746` — about 72% dark on white. Ours were drawing at
`--ui-text-quaternary`, 30%, barely a third of that weight. It read as faint in
light and vanished in dark (owner: *"darkmode calendar has faint gray labels and
makes it hard to see"*). They take `--ui-text-secondary` (66%) now, the closest
rung on this app's ladder to what was measured.

🔴 The harness reports colours but does not ASSERT them, which is why this sat
wrong for a fortnight while every geometry row passed. If a colour matters, it
belongs in `EXPECT`, not in the report-only list.

**Both of Google's remaining views now exist**: Schedule and 4 days, in Google's
menu order (Day · Week · Month · Year · Schedule · 4 days) and its wording. The
4-day grid starts on the day you are looking at rather than a week boundary,
which is Google's rule and the only thing that makes it different from Week.

## 13. THE GRID DRAWS GOOGLE'S PIXELS — reversing section 8, 2026-09-03

Owner, looking at a busy month: *"I want the calendar to be like smaller, or scale it down a bit,
because it still feels a bit big, especially when you have a lot of events. It feels like I'm a bit
too zoomed into it."*

**Section 8's rule — copy the rem, not the pixel — is reversed for the ruled grid.** Google's root
is 16px and this app's is 18, so every converted number arrived 12.5% larger than the reference it
was copied from. That is a defensible rule that produces a calendar a ninth bigger than the thing it
is meant to match, and "match one to one" was the owner's own acceptance condition.

🔴 **It had already been reversed once, for one row.** The week's day heading (section 12) was pinned
to Google's raw 11 / 26 / 46 in August, because at the converted 12.4 / 29.3 / 51.8 the owner said
the row was too big. The argument written there is the argument here: *a faithful proportion is a
12.5% bigger object, and an object is what the eye compares.* This makes the whole surface agree
with that row instead of half of it.

🔴 **Scope: the ruled surface only.** The header, the dialogs, the day rail and every other piece of
calendar chrome still scale with the root, as does all text elsewhere in the app. What is pinned is
the grid a week or a month is read on.

🔴 **A pinned box and pinned text must move together.** `GUTTER_WIDTH` was a rem because "12 AM"
wrapped once the app's text-size setting pushed the root to 20px. Pinning the gutter alone would
bring that back; pinning the gutter AND its label keeps them in proportion at any root. Widen both
or neither.

### Where the month view stood, and where it is now

Measured at 1470x835 against Google at the same size, both in real Chrome.

| part | Google | before | after |
|---|---|---|---|
| day cell padding | 0 | 9px | 4.5px |
| day cell gap | — | 9px | 4.5px |
| day numeral | 12 / 500 / 16 | 15.75 / 500 / 22.5 | 12 / 500 / 18 |
| date disc | none but today | 31.5px | 24px |
| weekday label | 11 / 500 / 20 | 12.375 / **600** / 18.6 | 11 / 500 / 20 |
| weekday band | 28px | 32px | 28px |
| **room a cell gives its events** | **~116px** | **87px** | **106px** |
| event chip | 24px tall, pitch 24 | 20px, pitch 22.2 | unchanged |

🔴 **THE CHIPS WERE NEVER THE PROBLEM.** Ours are *smaller* than Google's — 20px against 24. The
crowding was entirely the chrome around them: a cell gave its events 87px where Google gives ~116,
so a day with four events drew two and "+2 more". After: four.

### Week view

`node measure-calendar.mjs "http://localhost:<port>/dev-preview/calendar-week"` — **0 mismatches**
against Google's unconverted pixels. Hour row 54 -> **48**, gutter 57.4 -> **51.1**, hour label
12.4 -> **11**, event title 13.5 -> **12**, event radius 6.8 -> **6**, now dot 13.5 -> **12**.
