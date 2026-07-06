# Manus agent-run view + journal-club deliverable — live capture (2026-07-04)

Observed by watching a real Manus 1.6 Lite run of the prompt:
> "find me a journal club topic for biochemistry and give me the slides and report etc."

This is the fine-grain anatomy of the **agent-run view** (the ~30%-parity centerpiece from
`manus-vs-pharmaorb-comparison.md`) and the **journal-club deliverable**. Companion to
`manus-design-tokens.md` (colors/spacing) and `manus-ui-capture-log.md` (other surfaces).

Manus chose the topic itself: **AlphaFold 3** (Nature, May 2024).

---

## The run, top to bottom (center column)

1. **User bubble** — right-aligned, light-grey fill, the raw prompt.

2. **Agent header** — a small "🌱 manus" avatar + wordmark + a `Lite` tier chip.

3. **Ack line** — one natural-language sentence before any work:
   *"I'll find a high-impact biochemistry paper for your journal club and prepare the report
   and presentation slides for you."*

4. **Task-progress steps** (rendered inline, in order, each with a leading state icon):
   - ✓ **done** — filled check in a soft circle
   - ● **active** — filled blue dot; row is expandable (chevron `›`)
   - ○ **pending** — hollow/!muted
   The six steps for this run:
   1. Research and select a high-impact recent biochemistry paper
   2. Extract and synthesize paper content into structured notes
   3. Write the full journal club report
   4. Prepare slide content outline
   5. Generate the presentation slides
   6. Deliver the report and slides to the user

5. **Inline artifact cards** appear under the active step as it works:
   - **File-edit indicator**: a doc icon + `Editing files alphafold3_structured_notes.md` + a
     `+13` pill (count of other files touched). Later: `alphafold3_journal_club_report.md +23`.
   - **Slide-generation card**: a bordered card, header = the slide's title
     (e.g. "Enhancing Antibody-Antigen Modeling") + a right-aligned **`8 / 10`** counter, body =
     shimmer/skeleton lines while it renders, caption below = *"Batch generating slides 9, 10"*.
   - **Slide outline**: a numbered list, each item = **big number** + **slide title** + a
     one-line description. (This run produced a 10-slide outline — title slide through
     "Future Directions and Conclusion".)

6. **Per-step narration** — a short paragraph after each step summarizing what was found and
   what's next ("AlphaFold 3's breakthrough improves biomolecular interaction prediction, vital
   for drug discovery. Next, I'll identify a recent high-impact biochemistry paper…").

7. **Final delivery block** (on completion):
   - **Rendered title-slide preview** — a wide card: large centered title ("AlphaFold 3"),
     subtitle ("A Revolution in Biomolecular Structure Prediction"), two small lines
     ("Journal Club Presentation" / "Biochemistry & Structural Biology"), with a thin **left
     accent bar**.
   - **Report file card** — doc icon + `alphafold3_journal_club_report` + meta line
     `Markdown · 253.82 KB`. (Downloadable.)
   - **"View all files in this task"** button (folder icon).
   - **✓ Task completed** banner (green check + label) + copy icon + share/branch icon +
     *"How was this result?"* with a **5-star** rating control.
   - **3 follow-up suggestion chips** (icon + text + `›`), context-aware:
     - "Explain the Pairformer and Diffusion modules in more detail."
     - "Generate a presentation script for the AlphaFold 3 slides."
     - "Summarize the key findings of the AlphaFold 3 report in a webpage format."

---

## Pinned tracker (docked above the composer)

When the run is scrolling, a compact tracker stays pinned just above the message box:
- a small **thumbnail** of the current artifact,
- the **active step label** ("Generate the presentation slides"),
- **elapsed time** for that step (e.g. `1:35`),
- an **`N / 6`** counter,
- a **chevron** to expand the full step list (which shows every step + its elapsed time and a
  "Task progress" heading).

Composer while running: `＋` · tools-fork icon · **computer/monitor icon** on the left; mic + a
**black STOP circle** on the right (becomes the send ↑ arrow when idle). Placeholder: "Message Manus".

---

## "Manus's computer" panel (right side, opens on click)

Clicking the pinned thumbnail (or the monitor icon) slides in a right-hand panel:
- **Header**: title "Manus's computer" + subline "Manus is using **Editor**" · "Creating file
  `alphafold3_slides_content…`" + expand / layout / close (✕) icons.
- **Body**: the **live artifact** — the report markdown streams in line by line
  (`# AlphaFold 3: A Revolution…` / `## The Evolution of Structural Biology…` / bullet points),
  monospace-ish, syntax-tinted. For slides it renders the slide instead.
- **Footer**: a **playback scrubber** — skip-back / skip-forward buttons + a progress bar +
  a **"● Live"** indicator pinned to the right. You can scrub back through the agent's work.

---

## What we already have vs must build (for the clone)

**Reuse (PharmaOrb already emits/has):** the research engine already produces ordered progress
steps and source/citation/verification counts; report generation + PDF/Word/PPT export exist;
a `feat/journal-club` branch has groundwork.

**Build (missing Manus surfaces):** the ordered **task-progress tracker** (per-step state +
timers) + **pinned dock**; the **right-side work panel** (live artifact body + playback);
**inline artifact cards** (file-edit indicator, slide-gen card with N/M + shimmer, slide-outline
list); the **delivery block** (title-slide preview + file card + "view all files" + completed
banner + rating + follow-up chips); and a **one-click "Journal Club" tool** that drives
topic → notes → report → slides → deliver.

**Moat reframe:** our version of "Manus's computer" is *"watch the evidence assemble"* — sources
streaming in during gathering, claims being verified — which is real substance Manus's generic
"Editor" panel doesn't have.

**Hard constraint:** never touch `supabase/functions/ask/**` (frozen, guardrail suite).
