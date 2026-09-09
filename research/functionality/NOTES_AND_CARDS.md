# How Notion models notes and how Mochi models cards

Measured 2026-09-09. This is the **functionality** teardown, not the design one. The design work
lives in `/research/design-references/`; this file is about data models and enforcement.

Owner's framing, 2026-09-09: agents should use the tools in our app to build flashcards, study
guides and tests **under strict rules, so the output is consistent and structured rather than AI
slop.** The question this file answers is what those rules should be, taken from two products that
already solved it.

## Method, and a correction

The first pass read Mochi's published documentation. The owner pushed back: *"why are you reading
docs? Aren't you supposed to be looking at the actual page source?"* He was right, and I had
switched method without saying so. Documentation says what a company claims; the client bundle says
what it does.

- **Notion** was measured through its own connector by writing a page and reading it back.
- **Mochi** was measured by pulling `app.mochi.cards/js/.../core.js` (5.5 MB, ClojureScript via
  shadow-cljs, internal namespace `memo`) and extracting its compiled keyword schema — 206 distinct
  entity keys. Their app needs an account; the bundle that runs it does not.
- **RemNote** could not be measured. The document URL the owner supplied returns 404 and redirects
  to `/sign_in`. That one needs his login.

---

## 1. Notion: a note is a lossless block tree

I wrote a study note through the connector using every block type a note plausibly needs, then
fetched it back. **Every block survived the round trip byte for byte** — callouts with icons and
colours, an ordered list with indented children, a header-row table, inline and display maths,
toggles, to-dos with checked state, a quote, dividers, a table of contents.

That is the finding. Notion's note format is a **lossless text serialisation of a block tree**. An
agent can emit it, and read back exactly what it wrote. Nothing is inferred and nothing degrades.

### The six blocks a study note actually uses

The test page used thirty of Notion's block types and only six did real work:

| Block | Job in a study note |
|---|---|
| Callout | The definition. A definition in a plain paragraph is invisible when scanning. |
| Ordered list **with children** | The mechanism. The child block is the *why* and must collapse. |
| Table with a header row | The comparison. Rendered as bullets, a comparison loses its shared axes. |
| Equation, inline and display | The quantity. |
| **Toggle** | The self-test. See below — this is the seam. |
| To-do | What is still open. |

**A toggle is a flashcard that has not been extracted yet.** Question on the outside, answer on the
inside, already authored by whoever wrote the note. Any note containing toggles already contains a
deck, and the extraction is mechanical rather than generative. That is the single most useful thing
in this document: it means cards can come out of notes without a model inventing anything.

---

## 2. Mochi: a card is a Markdown document under a template

Straight from the compiled schema. `card/*` carries 74 keys; these are the load-bearing ones.

```
identity     card/id  card/user-id  card/content  card/tags  card/attachments
template     card/template  card/fields  card/field  card/rendered-template
schedule     card/due-date  card/interval-length  card/last-review-date  card/reviews
             card/retention-rate  card/reverse-retention-rate
state        card/archived?  card/trashed?  card/retired?  card/due-today?  card/pinned?
             card/being-learned  card/being-reviewed  card/being-rereviewed
grading      card/remember  card/forget  card/learn  card/reset-reviews
```

### The five things worth taking

**1. Content and presentation are separate, and that is the enforcement point.**
A template is `template/fields` + `template/style` + Markdown with `<<placeholder>>` markers. Fields
are typed (`field/type`: text, checkbox, number, plus dynamic types) and exactly one is primary
(`field/primary-description`), which names the card. A card built from a template holds **field
values, not prose**.

This is the mechanism the owner described. An agent asked to "write a good flashcard" produces
slop. An agent asked to **fill four typed fields** cannot, because the shape is not its decision.

**2. A deck can force one template on every card in it.**
`deck/template` and `deck/set-all-cards-to-template`. That is where consistency is actually
enforced — not per card, per deck. Our equivalent: a deck declares its card schema, and every card
the agent produces for it must satisfy that schema or be rejected.

**3. Changing a field's type is a guarded operation.**
`field/confirm-change-type`, `field/yes-change-type`, `template/cards-in-use`,
`template/decks-in-use`. They count what a change would break before allowing it. A schema that can
be silently altered is not a schema.

**4. Each cloze deletion carries its own review history.**
`cloze/index`, `cloze/indexes`, `cloze/reviews`, `cloze/needs-rereview?`. A card with five blanks is
five schedules, not one. Anything else means one hard blank drags four easy ones back with it.

**5. Reverse review is a card property, not a separate card.**
`card/review-reverse` and a distinct `card/reverse-retention-rate`. Front-to-back and back-to-front
are one card with two scores.

### Smaller findings

- **Three grades, not four.** `review/again`, `review/forgot`, `review/remember`. Anki ships four
  and most people use two.
- **`srs/multiplier-noise`** — deliberate jitter on the interval multiplier so cards scheduled
  together do not come due together forever. Ours should do this; it is a two-line change that
  prevents review pile-ups.
- **Only three custom Markdown components exist** in the whole client: `cloze`, `media`,
  `canvas-draw-lazy`. Everything else is plain Markdown. The restraint is the point.
- **Sides are just `---`.** A card is one Markdown document split on a horizontal rule, and it can
  have any number of sides, not two.
- Scheduling is server-side; only the noise toggle is exposed on the client.

---

## 3. What this means for us

The two products agree on a shape, and it is not "let the model write things":

1. **The note is the source of truth** and is a block tree, not prose. Ours already is (BlockNote).
2. **Cards are extracted from note structure, not generated from note text.** A toggle becomes a
   card. A table row becomes a card. A callout becomes a definition card. Prose paragraphs become
   nothing, which is correct.
3. **A card is field values under a template**, and the template belongs to the deck. The agent's
   job is to fill typed slots; it never chooses the shape.
4. **Every generated card carries provenance** back to the block it came from, so a learner can see
   why a card exists and fix the note rather than the card.

Point 3 is the answer to "not just random AI slop". Consistency does not come from a better prompt.
It comes from the model not being allowed to choose the structure.

### Still open

- **RemNote is unmeasured.** The owner's document URL needs his login.
- **Mochi's rendered card UI is unmeasured.** The design of their card — sizes, spacing, the review
  controls — is behind the account wall. The schema above is functional, not visual.
- Our current flashcard component was measured against **Claude.ai's** learning card in August, not
  against Mochi or RemNote. It is not a 1:1 of either, and was never claimed to be until now.
