# Is there a structural signal for `conceptual_system`?

**Research task, 2026-08-15.** Contract R4 (`docs/canvas-product-contract.md:88-117`) names six
kinds of knowledge. Four now mint objectives end to end (`association`, `causal`, `spatial`,
`classification`). `procedure` gained a structural extractor today (`procedure-sequence.ts`,
2026-08-15) but is not yet wired into `objectivesForKnowledge` — a different lane's finding,
noted here only so this document doesn't read as contradicting R4 by omission. **`conceptual`
is the one this document is about, and it has no wiring at all.**

R4's own words: *"`conceptual` and `procedural` have no defensible structural signal in a grid
the way a repeating column gives one for a class — finding what in a document says 'this is a
procedure' without a per-field keyword list is the open problem, not the plumbing."*

**Verdict: abstain.** Six candidate signals were tested against the real parsed corpus. Four fail
outright, each on measured false positives from real documents. The other two are not rejected —
the corpus simply cannot speak to them, because the field or the lane they depend on has never
been populated at any volume. Of those two, one (a causal-relation graph, once it has edges to
show) is named below as the conditional path forward; the other, even fully unblocked, would
prove something adjacent to `conceptual_system` rather than the thing itself — see §4.4. None of
the six "passes" today. The strongest of the four rejections is not a corpus artifact, though —
it holds regardless of how much more data arrives, and it is why this document abstains with
confidence rather than by default.

---

## 1. What `conceptual_system` means, and its nearest neighbour

`knowledge-types.ts:47-48`:

> Many interacting parts, learned by building a model at low resolution and refining it.

Its neighbour, `causal` (`knowledge-types.ts:43-44`):

> Chains of dependency, where the goal is to simulate the system rather than recite arrows.

These are close on purpose — the brief treats "simulate a system" as part of causal knowledge
too. The working distinction this document uses, consistent with how `CausalRelation` is
modelled (one directed edge, never a mechanism — `knowledge-types.ts:199-205`): **`causal` is one
edge; `conceptual_system` is what you get when several edges share nodes and can no longer be
answered one at a time.** A single "A causes B" is causal. "A and C both feed B, and B feeds D"
is a system — answering "what happens to D if A increases" requires composing two edges, not
recalling one. This distinction is load-bearing for the implementation sketch in §6.1.

## 2. The corpus this was measured against

17 parsed documents exist in production (`parsed_documents`, project `qyjmivntajbigjswhahb`). 11
carry real block structure; 6 are degraded to a single flat text unit and contribute nothing
structural. Of the 11:

| doc_kind | count | subject matter |
|---|---|---|
| pdf | 5 | pharmacotherapy syllabi, diabetes pathophysiology, pharmacokinetics lecture |
| pptx | 2 | pharmacogenomics lecture (999 blocks), PK consult documentation (188 blocks) |
| docx | 2 | a synthetic acceptance-test fixture, a genetics teaching scenario |
| xlsx | 1 | **bicycle gearing and derailleur mechanics** — the one non-pharmacy document |
| pdf | 1 | a second synthetic acceptance-test fixture |

🔴 **The corpus is overwhelmingly one field.** 16 of 17 documents are pharmacy/pharmacology. The
bike-gearing spreadsheet (`c726cc65-ed7b-4db5-bf12-3ce5d8d29df0`) is the only outside check on
whether a candidate signal is really structural or secretly keyed to this field's vocabulary, and
it turns out to matter — see §4.1. This thinness is named explicitly in §8.

164 `KnowledgeObject` rows exist today: 163 `association`, 1 `causal`, 0 `classification` (the
wide-grid lane is newer than this stored batch). This number matters for §4.4.

## 3. What structure actually reaches an extractor

The task asked for every structural field on `DocBlock` (`packages/shared/src/document-model.ts:421-441`)
and whether it survives to `CanonicalSourceUnit`, the one shape every extractor reads
(`apps/web/lib/sources/source-context.ts:132-194`, built by `unitsFromModel` at lines 424-488).

| `DocBlock` field | Meaning | Crosses to `CanonicalSourceUnit`? |
|---|---|---|
| `kind` | heading / paragraph / listItem / table / figure / … | Yes, as `type` |
| `text` | block text | Yes |
| `headingPath` | enclosing heading titles, outermost first | Yes, on `anchor.headingPath` |
| `level` | heading depth, 1-9 | **No** |
| `marker` | list item's own marker (`3.`, `c)`) | Yes — landed recently (§46.6-era), and the comment at `source-context.ts:160-163` says it explicitly: *"it was dying here"* |
| `depth` | list item nesting | Yes, same recent crossing |
| `rect` | bounding box, PDF/PPTX only | **No** |
| `table` | rows, headerRows, columns, origin | Yes (cell spans/formulas deliberately do not — `source-context.ts:85-90`) |
| `figure` | caption, description, **labels**, ref, asset | Yes, all fields including `labels` (§46.6) |

🔴 **`level` and `rect` never leave the parser.** Any candidate built on "how deeply is this
heading nested" or "are these figures laid out adjacent on the page" cannot be built from what an
extractor receives today, independent of whether the idea is otherwise sound — this is a data-path
fact, not a design objection. It rules out candidate F and weakens candidate E before either is
tested on content (§4.2, §4.3 test them anyway, because the raw model in Postgres still has both
fields and the false positives are worth recording regardless of the boundary gap).

## 4. Candidates tested

### 4.0 — Candidate B: a column whose non-subject value repeats (the one that matters)

**Rule considered:** in a wide grid (`width ≥ 3`, `classAxesOf`'s domain — `wide-grid-classification.ts`),
a non-subject column where one value is shared by ≥2 distinct subjects marks those subjects as
*interacting parts of one thing*, rather than *members of one category*. This is the shape that
made classification work (`wide-grid-classification.ts:14-19`: *"a column with FEWER values than
rows groups them, and grouping is the only thing that makes … a question with a defensible
answer"*), repurposed for convergence instead of category.

**Real example, the bike-gearing sheet, "Shifting mechanics" table** (`c726cc65`, 8 data rows,
`Adjustment | Effect | Statement`):

```
Chainring size      → Gear ratio
Cassette cog size   → Gear ratio
Cable tension        → Derailleur position
High limit screw     → Smallest cog position
Low limit screw      → Largest cog position
B tension screw      → Jockey wheel to cassette gap
Shifter click         → Cable length change
Cross-chaining        → Derailleur strain
```

`Gear ratio` is the *Effect* of two different rows — two parts of a derailleur system converging
on one shared quantity. Structurally this is **exactly** the shape `classAxesOf` already reads:
a non-subject column, 8 populated cells, 7 distinct values, one value repeated across 2 rows,
neither index-shaped nor enumerated. Run against the real CYP2D6 metabolizer table in the same
corpus (`535cbdc4`, `Genotype | Allele function | Type of Variation | Predicted Metabolizer status`),
the identical shape — `Poor (PM)` repeated across `*3/*3` and `*3/*6` — is the worked example the
classification lane's own docstring cites (`wide-grid-classification.ts`).

🔴🔴 **These two repetitions are structurally identical and mean opposite things.** `Poor (PM)`
is a genuine category — `*3/*3` and `*3/*6` *are* both Poor metabolizers, full stop. `Gear ratio`
is not a category that `Chainring size` belongs to; it's a quantity two different parts jointly
determine. Same cardinality (2 of N), same column position (last non-subject column), same
absence of index-shaping. **Nothing in the grid's shape tells them apart.** The only thing that
does is the header word — `Predicted Metabolizer status` versus `Effect` — and reading the header
word to decide meaning is the exact inference the owner rule at `knowledge-extraction.ts:343-351`
forbids: *"the relation is named by the source's own header, never by an interpretation of it …
deciding that 'class' means class-membership is subject-matter inference."* Reusing the repeated
column as a `conceptual_system` signal, on top of a lane that already claims that shape for
`classification`, would mint two different knowledge types from identical cells with no
structural tiebreaker between them — worse than a low-precision rule, because there is no
threshold that fixes it.

**This is the rejection that matters most in this document, and it is the one not specific to this
corpus.** More data does not resolve it: it is a fact about what a grid's shape can encode, not
about how much of it exists. §8 returns to why that makes it the load-bearing finding here rather
than one bullet among six.

### 4.1 — Candidate D: consecutive-paragraph run length, as a proxy for sustained exposition

**Rule considered:** a heading followed by ≥3 consecutive `paragraph` blocks (no intervening
table, list or figure) marks sustained explanation — "building a model," not stating one fact.

**Measured** (window-function run-length over all 11 structured documents, grouped between
non-paragraph blocks): **104 of 170 prose runs (61%) are ≥3 paragraphs long.** A rule that fires
on 61% of everything is not a signal, and the false positives confirm it by inspection, not just
by rate:

- `Testing Policy` (4e56fcda) — 14 straight paragraphs of exam-attendance rules.
- Nine different `Poll Everywhere multiple choice poll activity` slides (535cbdc4) — 9 paragraphs
  each, every one UI chrome around a quiz question, none of it conceptual.
- `Course Schedule` (4e56fcda) — 73 paragraphs, a syllabus grid flattened by the parser into
  running text (`"Page 10 of 26"` is literally the first line of the run).

against real positives of the same shape:

- `The Genetic Code is Degenerate` (535cbdc4) — 5 paragraphs, genuinely conceptual (64 codons →
  20 amino acids + 3 stops, a many-to-few mapping).

🔴 A second, compounding finding: only **one of the 11** structured documents (`acdc16dd`, a
docx) has any real `listItem` block at all. Every PPTX deck in the corpus — the majority of the
block count — renders its bullets as bare `paragraph` blocks with a literal `"- "` or `"l "`
prefix baked into `text`, never as `marker`/`depth`-bearing list items. So a refinement that tried
"count real list markers instead of paragraphs" has nothing to read in the format that dominates
this corpus. Rejected: fires on the majority of the corpus regardless of content.

### 4.2 — Candidate E: adjacent figure blocks on one page/slide, as a proxy for a multi-panel diagram

**Rule considered:** ≥2 `figure` blocks on the same `unit` (page/slide) mark a decomposed,
multi-part diagram — panels of one system rather than one photo.

**Measured** against the one document with both adjacency and real vision descriptions
(535cbdc4, 28 figures, ordered by position): the single strongest run in the whole corpus is
**four adjacent figures on unit 8** —

> a yellow can of "Red Gold Tomato Paste" … a can of "Contadina Roma Tomatoes Paste" … a yellow
> package of "Cento Double Concentrated Tomato Paste" … a standard black-and-white barcode

Four competing brands of tomato-paste can, photographed for a label-reading exercise. Meanwhile
**every genuine multi-part system diagram in the same deck is a single, undecomposed figure
block**: the DNA→mRNA→protein transcription/translation flow (one image), the eleven-organ
drug-distribution figure ("Brain, Lungs, Gastrointestinal system, Skin epithelium, Kidney,
Reproductive organs, Bone, Muscle, Gallbladder, Liver, and Heart" — eleven interacting parts, one
block), the CYP2D6 nomenclature tree (superfamily → family → subfamily → allele, one block). 🔴
**The correlation runs backward**: real systems arrive as one picture; adjacency marks unrelated
photos bundled on one slide. Rejected on an inverse signal, not merely a weak one — and see §3,
this candidate also needs `rect`/geometry that never crosses the extraction boundary anyway.

### 4.3 — Candidate F: heading fan-out, as a proxy for "many parts introduced together"

**Rule considered:** a heading with unusually many direct sub-headings marks a topic being broken
into several interacting parts before each is taught separately.

**Measured:** the majority of the corpus by block count is PPTX, and every PPTX deck in it has
**zero heading nesting** — every slide title's `headingPath` is `[]`. The signal cannot fire on
the dominant format at all. Where nesting exists (the two real PDFs), it is font-size parsing
noise, not topical structure. Concretely, `Four primary PK variables that you MUST know!`
(`bbe9c173`) gained three sub-headings:

```
1. Memorize the 4 PRIMARY PK variables
2. Memorize the 2 factors that defines a PRIMARY PK variables
3. Understand this following relationship
```

— a numbered instructional list, mis-promoted to headings by font size, not three interacting
parts. Elsewhere in the same document a chart's own axis labels (`"Breakfast Lunch Dinner Means
± 2 SD"`, `"pmol/L mU/L"`, `"Time (hours)"`) form a five-level heading tree under `Glucose and
insulin homeostasis in normal, non-diabetic people` — a section that *is* genuinely about a
real physiological feedback system, but the fan-out under it is chart-axis noise, not evidence of
it. Rejected: absent from the dominant format, and noise where present. Also independently killed
by §3 — `level` does not cross the extraction boundary, so no extractor could compute "how many
direct children" without re-deriving heading hierarchy the boundary already discarded.

### 4.4 Not measurable in this corpus (recorded separately from the four rejections above)

🔴 Two candidates are not rejected — the corpus cannot speak to them at all, which the codebase's
own vocabulary already distinguishes (`ExtractionOutcome`: `complete` vs `degraded`; `DocFigure`:
"figures unexamined" vs "figures with no description"). Collapsing these into the rejections above
would make a coverage gap read as a design dead end.

**Candidate A — figure-label density.** `DocFigure.labels` (§46.6) exists precisely to let a figure carry
named, positioned parts, and `figure-knowledge.ts`'s `isOccludable` already treats ≥2 labels as
meaningful. Raising that bar (say, ≥4 labels) would be a defensible way to tell a system diagram
from a two-label illustration.

Measured: **0 of 74 real figures in the corpus carry any populated `labels` array** — including
figures whose vision *description* explicitly names multiple interacting parts (the eleven-organ
figure, the CYP2D6 nomenclature tree, a three-gene structural comparison across Beta Globin,
Factor VIII and HPRT). The field the signal needs is specified, wired at the extraction boundary
(§3), and consumed downstream — it simply has not been populated by any vision pass that produced
this corpus. Zero true positives and zero false positives are both unavailable to observe. This
is an ingestion-coverage gap, not a rejected hypothesis.

🔴 Even fully unblocked, this candidate is weaker than C. A diagram with four named parts —
"brain, lungs, heart, kidney" on a body outline — shows that four things are *labelled*, not that
they *interact*. That is a denser `spatial` object (more parts to occlude), not evidence the parts
depend on each other. Populating `labels` would still be worth doing — it is the cheaper gap to
close, and it strictly improves the existing `spatial` lane regardless of what happens with
`conceptual_system` — but it is not, by itself, a `conceptual_system` signal. §6 recommends C, not
this, as the conditional target for that reason as well as the data one.

**Candidate C — causal-graph convergence.** `CausalNode.key` is explicitly designed, per its own docstring
(`knowledge-types.ts:132-142`), so that *"a mechanism can be assembled later by joining edges …
rather than being stored now as one opaque paragraph."* A `conceptual_system` signal built on top
of the `causal` lane's own output — ≥2 `CausalRelation` objects whose `cause.key` or `effect.key`
collide, forming a convergence (in-degree ≥2) or a cycle — is exactly the assembler that
sentence anticipates and nothing has built.

Measured: the `knowledge_objects` table holds exactly **one** `causal` row in the entire corpus
(`fbef1111…`, the Ohm's-law acceptance fixture: *"increasing resistance decreases current, when
voltage is held constant"*). A degree-2 node needs two edges sharing a key; with n=1 there is
nothing to observe, positively or negatively. 🔴 Two compounding reasons this stays unmeasurable
even as more documents arrive: (1) `CausalRelation` extraction itself needed a full LLM
abstain-first contract because trigger-word matching over this corpus was 14% precise
(`causal-extraction-contract.ts:9-13`) — a convergence signal stacked on top inherits that lane's
own uncertainty; (2) `CausalNode.key`'s own docstring admits it is normalised text, not resolved
entity identity — *"'protein function' and 'the function of the protein' are two nodes today"*
(`knowledge-types.ts:137-142`) — so two edges about the same real convergence would only collide
if the source (or the extractor) phrases the shared node consistently, which is not guaranteed
even once volume exists.

## 5. The general principle

The shapes a parsed document can offer are finite, and this codebase has already spent nearly all
of them on the other five knowledge types:

| Shape | Claimed by |
|---|---|
| distinct subject column + other columns describing each row | `association` (`table-subject-column.ts`) |
| non-subject column whose value repeats across distinct subjects | `classification` (`wide-grid-classification.ts`) |
| consecutive ordinal list markers | `procedure` (`procedure-sequence.ts`) |
| ≥2 named, positioned parts on one figure | `spatial` (`figure-knowledge.ts`) |
| an explicit assertion verb in prose, model-verified against the passage | `causal` (`causal-extraction-contract.ts`) |

What is left, after those five claims, is undifferentiated paragraph text and pictures carrying
no structured labels. 🔴 **Interaction is a property of what parts MEAN to each other, not of how
they are laid out on a page.** Two rows that causally converge and two rows that are simply
alike are typeset identically — same column, same repetition, same absence of index-shaping.
That is not a gap in this search; it is the reason the search comes up empty. A structural rule
can tell you a value repeats. It cannot tell you *why* — and "why" is exactly the fact that
separates a category from a system.

## 6. Recommendation

**Abstain on a deterministic structural extractor for `conceptual_system` today.** No candidate
survives contact with the real corpus, and the strongest rejection (§4.0) is not a data problem
that more documents would fix.

**Conditional path, not a build recommendation:** if this is revisited, build the mechanism
assembler `CausalNode.key` already anticipates (§4.4-C), over already-extracted `causal` objects
— never a new pass over raw parsed blocks, and never the wide-grid column reuse §4.0 rules out.

### 6.1 What that would look like, sketched in the house pattern

```ts
// mechanism-assembly.ts (NOT BUILT — sketch only)

/** Two or more causal edges that share a node, forming a convergence or a cycle rather than a
 *  single chain — contract R4's `conceptual_system` kind. */
export interface Mechanism {
  nodes: readonly CausalNode[];
  edges: readonly CausalRelation[];
  /** "convergent": ≥2 edges share an effect. "cyclic": A→B and B→A both hold. */
  shape: "convergent" | "cyclic";
}

export type MechanismRefusalReason =
  /** Fewer than two causal edges exist for this source at all. */
  | "insufficient-edges"
  /** Edges exist, but no CausalNode.key repeats between any two of them. */
  | "no-shared-node"
  /** Shared nodes exist, but they form one path (A→B→C), not a convergence or a cycle. */
  | "single-chain";

export function mechanismsOf(
  edges: readonly KnowledgeObject[], // type === "causal", already validated per causal-extraction-contract.ts
): { mechanisms: Mechanism[]; refusals: { reason: MechanismRefusalReason; detail: string }[] };
```

`[]` would be the common, correct answer for most sources, exactly as it is in every existing
lane — most documents extract zero or one causal edge, and one edge is a chain, not a system.

**Capability gap, checked rather than assumed:** `openingOperation("conceptual_system")`
(`knowledge-types.ts:558-559`) already returns `"explain"`, but that is the *brief's* 14-value
vocabulary (`CognitiveOperation`), not the *minted* one. The minted union is narrower —
`ObjectiveCapability = "recall" | "discriminate" | "explain" | "predict" | "locate" | "sequence"`
(`learning-objective.ts:57`) — and `"explain"` is already spoken for: the file's own comment
(`learning-objective.ts:40-56`) reserves it for causal's un-shipped *backward* question — *"why is
this the case?"* over a single existing edge — and warns against exactly the move of collapsing
the wide vocabulary onto the narrow one. A real `conceptual_system` objective needs a **new**
capability, per the same file's own rule (line 42: *"add a capability when something mints
it"*), the way `discriminate` was added when the classification lane needed it. `RetrievalTask`
(`canvas-model.ts:319-328`), a separate, LLM-driven vocabulary used elsewhere in the Canvas, already
has an unused `"mechanism"` task — *"walk through how something happens, step by step, in
order"* — which is a reasonable naming precedent, not a binding one; the two vocabularies are not
interchangeable — `learning-objective.ts:44-55` names this exact trap for causal's capability
(*"mapping a wider operation vocabulary DOWN onto a narrower one"*) and it applies here too.

**What the learner would be asked**, and why it is not just causal's `predict` again:
`causalObjectives` already asks *"say what follows from X, and why"* over one edge
(`learning-objective.ts:281`). A `conceptual_system` task has to be a question **no single stored
edge can answer** — composition, not recall of a longer fact. Concretely: show the learner two of
the mechanism's nodes and the edges connecting them, then ask what happens to a downstream node if
an upstream one is perturbed (chaining ≥2 edges to answer), or ask them to reconstruct the
low-resolution shape of the whole mechanism — name the parts and the direction of influence
between them, refined on a second pass. Per `requiresProduction` (`knowledge-types.ts:579-581`),
this must be free response; recognition would test whether the learner can pick the right diagram
out of four, not whether they can simulate it.

## 7. What would have to be captured for a signal to become possible

Neither blocker is a parser change. `DocumentModel` and `CanonicalSourceUnit` already carry every
field either path would need (§3); nothing here asks for a new structural primitive.

1. **For the figure-label path (§4.4-A):** the vision pass needs to actually populate
   `DocFigure.labels` for multi-part diagrams at ingestion time. The schema, the boundary crossing
   and the downstream consumer (`isOccludable`) already exist; today no real document in
   production has ever had this field filled in. This is the cheaper of the two gaps to close,
   because it is a coverage problem in an existing pipeline stage, not new design.
2. **For the mechanism-assembly path (§4.4-C):** the `causal` lane needs to run at real volume
   across a real corpus before `CausalNode.key` collisions can be observed at all — one edge
   cannot demonstrate convergence any more than one table row can demonstrate that a column
   repeats (the same "two rows minimum" reasoning `subjectColumnOf` and `classAxesOf` already
   apply). Volume alone may not be sufficient — see the node-identity caveat in §4.4-C — but it is
   necessary before the question is even askable.

## 8. The objection, and why it doesn't reopen this

**"You measured this against 17 documents, 16 of them pharmacy, with zero populated figure
labels and exactly one causal edge — of course nothing looked promising."** This is a fair
challenge and worth stating plainly rather than leaving implicit.

It fully applies to §4.4's two candidates (A, C) and to the negative counts in §4.1-4.3 (D, E, F)
— all five are measurements over one thin, lopsided corpus, and a bigger, more diverse one could
in principle shift them: more labelled figures, more causal density, fewer administrative
sections, a genuine multi-field mix instead of one bicycle spreadsheet standing in for
"not-pharmacy."

**It does not apply to §4.0.** The rejection there is not "this shape is rare in 17 documents" —
it is "this shape, wherever it appears, is the shape `classAxesOf` already claims for
`classification`, and nothing about the grid distinguishes a converging cause from a shared
category." Ten times the corpus produces ten times the ambiguous tables, not a way to resolve
them. That is what makes the abstention in §6 a conclusion rather than a placeholder for more
data — one of six candidates is closed on logic, not on sample size, and it is the one this
document leans on.

## Bottom line

- **Recommendation:** no deterministic structural extractor for `conceptual_system` today.
  Abstain, and say so in whatever inventory tracks R4's six kinds, rather than shipping a
  low-precision guesser.
- **Evidence:** six candidates tested; four rejected on measured false positives from the real
  corpus (a converging-column reuse that collides with `classification` by definition; a
  paragraph-run rule that fires on 61% of all prose; an adjacent-figure rule whose strongest real
  instance is unrelated product photos while every genuine system diagram is one undecomposed
  block; a heading-fan-out rule absent from the corpus's dominant format and noise where present);
  two more (figure-label density, causal-graph convergence) are not rejected but unmeasurable —
  the fields/lanes they need are specified and wired but not yet populated at any volume.
- **Strongest objection:** the corpus is thin and one-field-heavy, so five of six findings are
  provisional on more data. Named in §8, and it's real.
- **Confidence:** high on the recommendation to abstain now; high on §4.0 as a durable,
  corpus-independent reason rather than a sample-size artifact; moderate on causal-graph
  convergence (§4.4-C / §6.1) as the right conditional target if this is revisited, since it is
  the one candidate whose blocker is data volume rather than a structural collision with an
  existing lane.
