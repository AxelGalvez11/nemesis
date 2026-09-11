# Sana: observed interaction patterns

**Tiered motion by proximity to the pointer.** Three speeds, chosen by what is changing:
0.02s for hover fills, 0.1s for colour, 0.2s for shape. The most transferable idea in the reference
set, adopted in `/design/MOTION.md`.

**Inset focus rings.** `box-shadow: inset 0 0 0 2px`, held transparent when unfocused, so keyboard
navigation never shifts a row. Adopted.

**The accent is not the action.** The primary button is the darkest neutral; the brand lime is
decorative. A user never hunts for the coloured thing. Adopted as our central colour rule.

**A composer with no border.** The main input is a soft wash at 5% ink with a large radius and no
outline, which reads as part of the page rather than as a form field. Adopted for our composer.

**Block-based content.** The editor is BlockNote: content is a list of typed blocks rather than a
document blob, which is what allows a poll, a quiz and a paragraph to coexist in one flow. Our
`ContentBlock` follows the same architecture.

**Almost no elevation.** The application chrome has effectively no shadows. Hierarchy is background
steps and hairlines. Adopted.
