# Canvas task hosting — migration step 7b

Implements [`canvas-cognitive-runtime.md`](./canvas-cognitive-runtime.md) §8 (compositional Canvas)
and §13 step **7b**: *"Policy tasks stop replacing the page; the Canvas presents them alongside its
document."*

**Scope.** The runtime seam only. This document does not define what a cognitive operation *means*
(Brain Claude) or what a task *looks like* (UI Claude). It defines where a task lives, who owns the
learner's next answer, and what may appear beside what.

---

## The question this answers

Today the Canvas asks:

> Which runtime owns this entire page?

After 7b it asks:

> Does the current objective have a supported cognitive interaction that Canvas can present?

Whole-page ownership was migration scaffolding, and §12 records its measured cost: it owns **0 of 6
production canvases**, because ownership requires `unrepresented === 0` and real material always
contains something the association lane cannot represent. The fix is not a lower threshold
(§14.1 forbids that) — it is to stop making presentation an all-or-nothing property of the page.

---

## 1. `status` currently means two different things

`usePolicyRuntime` reaches `setStatus("inactive")` from three places that are not the same fact:

| Exit | Meaning | After 7b |
|---|---|---|
| `!enabled \|\| !uid` | policy is off, or nobody is signed in | still unavailable |
| `!resolved.ownership.owns && !forced` | **coverage refused the whole canvas** | **no longer suppresses the task** |
| `supported.length === 0` | nothing supported to ask about | still nothing to host |

Collapsing these is how you ship a runtime that hosts an empty task shell over a document. So the
enum splits, and ownership stops being a gate:

```ts
status: "loading" | "ready" | "unavailable"   // can the runtime run at all
task:   HostedTask | null                     // does it have something to present right now
ownership: OwnershipDecision                  // reported, never gating presentation
```

`ownership.owns` keeps its exact meaning and keeps being computed — it is still what `forced`
discloses against, and it is still the honest answer to "could the policy have taken this whole
canvas?". It simply stops deciding whether a question may appear.

🔴 **`forced: forced && !knowledge.ownership.owns` does not change.** A bypassed session must still
declare itself; that property is orthogonal to hosting and its test stays as-is.

---

## 2. One answer sink, made unrepresentable rather than remembered

The live hazard. Today the composer picks a route with a ternary:

```tsx
onAnswer={policyOwns ? policy.submit : session.answerActiveTask}
```

That is safe only because `policyOwns` is all-or-nothing. Once a task can be hosted *while*
`canvas.state === "recall"`, both surfaces believe they own the answer: the loser silently drops
evidence, or the policy's prompt id receives an answer typed at a recall card. Either way evidence
is corrupted while every unit test passes.

This is not fixed with another condition. It is fixed by deriving the route once, from a type that
cannot hold two:

```ts
export type AnswerSink =
  | { kind: "policy"; task: ActiveTask }
  | { kind: "stage";  task: ActiveTask }
  | { kind: "none" };
```

`answerSink()` is the only place that decides, and the policy wins when both are present — because
the stage machine's surfaces are suppressed in that case anyway (§3).

---

## 3. What may coexist, and what may not

The reshaped invariant. `canvas-runtime-branch.test.ts` protects the property *"the policy decided
and a competing surface painted anyway"*. That property survives 7b with a narrower subject list:

| Renderer | Coexists with a hosted task? | Why |
|---|---|---|
| `CanvasDocument` | **yes** | Reading material. Collects no answer, writes no evidence. This coexistence *is* 7b. |
| `CanvasEmpty` | yes | Pre-content state; there is no document and no task yet. |
| `SourcesAttached` | yes | Pre-content state. |
| `CanvasRecall` | **no** | Evidence-collecting. Second answer surface. |
| `CanvasTest` | **no** | Evidence-collecting. Second answer surface. |
| `CanvasDiagnosis` | **no** | Reports a verdict over the six-stage machine's own answers. |
| `CanvasComplete` | **no** | Terminal state of a run the policy is not running. |

So the rule is not "the six-stage machine is behind one branch" any more. It is:

> **Reading material may always coexist with a hosted task. Evidence-collecting surfaces never may.**

---

## 4. Focus scope (Minimap)

Per §11 the learner selects the *territory*; Nemesis manages the *path* through it. Selecting `RAAS`
sets `focus_scope = RAAS`. It must not mean `operation = flashcards`.

The runtime holds `focusScope` as **session-local state** and filters the candidate objectives
*before* `decideNext`. Filtering a candidate list is not choosing an operation, so the Brain contract
is untouched — the policy still picks freely inside the scope.

```
supported ──filter by focusScope──▶ decideNext(...)   // policy still chooses the operation
```

Supported today: **focus entire Canvas** and **clear focus** (they are the same state — no filter).

### 🔴 Missing Brain contract — territory hierarchy

`focus a parent topic` and `focus a child topic` **cannot be built yet**, and the substitute is
worse than the gap.

Objectives converge by `identityKey` (`knowledge-identity.ts`) and carry **no parent/child
relation**. There is no territory entity anywhere. Deriving one from document heading paths would be
a structural signal masquerading as a knowledge relation — headings are where text sat, not what
depends on what — and once the Minimap rendered that tree, its wrongness would be invisible.

**What is needed from Brain Claude, stated exactly:**

> A relation between knowledge objects and named territories: either a `territory` grouping on
> `KnowledgeObject` with a parent link, or a separate territory entity with membership. It must
> state whether a knowledge object may belong to more than one territory, and whether the relation
> is derived per-canvas or converges across canvases the way `identityKey` does.

Until that exists the Minimap can only offer the whole Canvas, and this document is the record of
why it stops there rather than guessing.

---

## 5. Variable tempo, structurally

§9 requires `fast → fast → fast → expand → scaffold → reconstruct → apply → compress → fast`, and
§14.6 forbids a uniform template. The runtime supports that by *exposing* the demand, never by
styling it:

```ts
tempo: "instant" | "deliberate"
```

Derived from the Brain's own `(knowledgeType, operation)` pair — `association × recall` is
`instant`; everything else is `deliberate`. The runtime does not interpret it and does not render
it. UI Claude decides what each one looks like.

🔴 This is a **projection of the Brain's decision, not a new cognitive claim.** When a second
knowledge type ships, its tempo comes from its operation — not from a list maintained here.

---

## 6. Evidence semantics — unchanged, mechanically

§5's invariants and §12's evidence fields are out of this lane entirely. The check is not an
assertion, it is a diff: 7b must change **zero lines** in

- `lib/learn/objective-task.ts` (`evidenceFromEvaluation`, `unobtainedEvidence`)
- `lib/learn/learner-evidence.ts`
- `lib/learn/response-admission.ts`
- `lib/learn/teaching-policy.ts`
- the evidence-writing region of `use-policy-runtime.ts` (`record`, `admitNothing`, `submit`)

"I don't know" semantics, correction → re-demonstration, judge-outage-writes-nothing, and
cross-session identity all live in those files and are not touched.

---

## 7. What changes for the six production canvases

🔴 **This is a real behaviour change, and it is the point.** Today a canvas the policy refuses shows
the six-stage machine, which generates a lesson over material the policy could not represent. After
7b the same canvas shows **its document, plus tasks for whatever inside it is supported**.

So "unsupported material behaves as before" means precisely: *it is still readable, and it is still
never drilled.* It does not mean the same code path runs. Unsupported knowledge remains
unrepresented — §14.2 holds, nothing is forced into a flashcard.
