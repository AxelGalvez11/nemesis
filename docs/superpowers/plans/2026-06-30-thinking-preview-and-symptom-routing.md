# Thinking Preview + Symptom Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the polished ChatGPT-style Ask thinking preview and fix the answer engine so general symptom questions like "Why do I have white flakes in my hair?" use high-quality consumer-health/literature sources instead of weak drug-label mentions.

**Architecture:** Split the work into two independent tracks. Track A reconciles the web Ask UI from the newer `codex/ask-thinking-preview` / `feat/auto-modes` work into the current branch, then deploys it. Track B adds a deterministic query-route layer for general symptom questions, improves live source selection/ranking, and adds tests that prevent FDA labels from becoming the primary source for non-drug symptom answers.

**Tech Stack:** Next.js web app, Supabase Edge Function `/ask`, Deno tests, Voyage rerank, live source adapters for PubMed/Europe PMC/OpenAlex/MedlinePlus/openFDA, GitHub/Vercel deployment.

---

## Diagnosis

The live app currently shows a partial/older thinking preview. The deployed UI still renders:

- `Fast · live` in the composer.
- A multi-line checklist under `Thinking`, showing `Reading`, `Searching`, `Ranking`, and `Composing` at once.

The polished UI exists in branch history around:

- `codex/ask-thinking-preview`
- `feat/auto-modes`
- commits including `3a0c52f`, `6ee4fd2`, `a734a6a`, and `4a04ffd`

The answer engine failure happened because the query "Why do I have white flakes in my hair?" was routed through a generic evidence path that let an isotretinoin DailyMed label become the only cited support. The live engine did fetch 12 sources, but the generated answer cited only the label. That is wrong for a general symptom question. For that class, MedlinePlus / dermatology consumer-health pages / reviews should outrank unrelated drug labels, and FDA labels should be secondary unless the user names a medication.

## Files

**UI merge/deploy:**
- Modify: `apps/web/app/app/ask/page.tsx`
- Modify: `apps/web/app/styles/shell.css`
- Possibly modify: `apps/web/components/ResearchProgress.tsx`
- Possibly modify: `apps/web/lib/api.ts`

**Engine routing/ranking:**
- Modify: `supabase/functions/ask/classify.ts`
- Modify: `supabase/functions/ask/prompts.ts`
- Modify: `supabase/functions/ask/templates.ts`
- Modify: `supabase/functions/ask/query-understanding.ts`
- Modify: `supabase/functions/ask/live-sources.ts`
- Modify: `supabase/functions/ask/cite-balance.ts`
- Modify: `supabase/functions/ask/source-support.ts`
- Modify: `supabase/functions/ask/index.ts`

**Tests:**
- Modify or create: `supabase/functions/ask/query-understanding.test.ts`
- Modify or create: `supabase/functions/ask/live-sources.test.ts`
- Modify or create: `supabase/functions/ask/cite-balance.test.ts`
- Modify or create: `supabase/functions/ask/source-support.test.ts`
- Modify or create: `supabase/functions/ask/consumer-symptom-routing.test.ts`
- Add eval case: `scripts/diag/mvp-engine-eval-cases.json`

---

### Task 1: Confirm Branch/Diff Source For Thinking Preview

- [ ] **Step 1: Inspect current branch state**

Run:

```bash
git status -sb
git branch --show-current
git log --oneline --decorate -12
```

Expected: current branch is `feat/auth-bot-protection` or the agreed working branch. Note dirty files before editing.

- [ ] **Step 2: Inspect source branches for UI changes**

Run:

```bash
git log --all --oneline --decorate -- apps/web/app/app/ask/page.tsx apps/web/app/styles/shell.css apps/web/components/ResearchProgress.tsx | head -40
git diff feat/auth-bot-protection..codex/ask-thinking-preview -- apps/web/app/app/ask/page.tsx apps/web/app/styles/shell.css apps/web/components/ResearchProgress.tsx
git diff feat/auth-bot-protection..feat/auto-modes -- apps/web/app/app/ask/page.tsx apps/web/app/styles/shell.css apps/web/components/ResearchProgress.tsx
```

Expected: identify the exact commits that remove `Fast · live`, simplify the thinking preview, and avoid showing the full step checklist in the chat body.

- [ ] **Step 3: Decide merge source**

Use the smallest patch that achieves:

```tsx
function Thinking({ stage, question, complete = false }: { stage: number; question: string; complete?: boolean }) {
  const preview = buildThinkingPreview(question, stage);
  const line = complete ? "Thought through evidence" : stage <= 0 ? "Thinking" : preview.current;
  return (
    <div className={`thinking engine-preview engine-preview-compact${complete ? " engine-preview-done" : ""}`} aria-live={complete ? undefined : "polite"} title={complete ? undefined : preview.preview}>
      <span className="engine-preview-title">
        {line}
        {complete ? <span className="engine-preview-chevron" aria-hidden="true">›</span> : <span className="engine-dots" aria-hidden="true"><span /><span /><span /></span>}
      </span>
    </div>
  );
}
```

Do not bring unrelated Discovery/Agent mode work unless required by imports.

---

### Task 2: Implement Polished Thinking Preview UI

- [ ] **Step 1: Write/verify UI expectation**

Manual expected behavior:

- During a normal Ask request, chat body shows a single compact line.
- At first it says `Thinking`.
- It then changes to one current status line, not a full checklist.
- It does not render a boxy multi-row activity panel in the chat body.
- The mode pill says only `Fast` or `Thorough`.

- [ ] **Step 2: Update composer mode label**

In `apps/web/app/app/ask/page.tsx`, replace:

```tsx
<b>{activeMode.label}</b>{activeMode.live ? (activeMode.pro ? " · Pro" : " · live") : " · soon"}
```

with a stable label helper:

```tsx
function composerModeLabel(mode: (typeof MODES)[number]["id"]): string {
  return mode === "thorough" ? "Thorough" : "Fast";
}
```

and render:

```tsx
<b>{composerModeLabel(mode)}</b>
```

Expected: no `· live` text appears in the chat bar.

- [ ] **Step 3: Replace multi-step Thinking markup**

In `apps/web/app/app/ask/page.tsx`, replace the checklist-style `Thinking` component with the compact version from Task 1. Keep the Deep Research `ResearchProgress` panel separate; this task only changes normal Ask thinking.

- [ ] **Step 4: Verify visual CSS**

In `apps/web/app/styles/shell.css`, ensure `.engine-preview-compact` has compact, non-boxy styling:

```css
.engine-preview-compact {
  width: min(560px, 100%);
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.engine-preview-compact .engine-preview-title {
  color: var(--text-2);
  font-size: 15px;
  font-weight: 500;
}
```

Expected: it visually resembles ChatGPT's inline thinking line, not a card.

- [ ] **Step 5: Run web typecheck**

Run:

```bash
pnpm --filter @pharmaorb/web typecheck
```

Expected: pass.

---

### Task 3: Add Consumer Symptom Query Routing

- [ ] **Step 1: Add failing tests**

Create `supabase/functions/ask/consumer-symptom-routing.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { understandQuery } from "./query-understanding.ts";
import { providerPriorityForIntent } from "./templates.ts";

Deno.test("white flakes hair is treated as a consumer symptom topic, not a drug-label topic", () => {
  const q = understandQuery("Why do I have white flakes in my hair?", [], "white flakes hair");
  assertEquals(q.fieldMentions, []);
  assertEquals(q.normalizedTerms.includes("dandruff"), true);
  assertEquals(q.researchQuery.includes("dandruff"), true);
  assertEquals(q.researchQuery.includes("seborrheic dermatitis"), true);
});

Deno.test("general symptom evidence priority does not label-first", () => {
  assertEquals(providerPriorityForIntent("general_health" as never), ["medlineplus", "pubmed_oa", "europepmc", "clinicaltrials"]);
});
```

Expected first run: fail because `general_health` intent and dandruff normalization do not exist yet.

- [ ] **Step 2: Add `general_health` intent type**

Update shared `Intent` typing in `packages/shared/src/answer.ts` if needed:

```ts
export type Intent =
  | "drug_overview"
  | "side_effects"
  | "label_summary"
  | "drug_interaction"
  | "pregnancy_pediatrics"
  | "mechanism"
  | "dosing"
  | "health_context"
  | "trial_lookup"
  | "evidence_for_claim"
  | "supplement_peptide"
  | "investment"
  | "comparison"
  | "general_health"
  | "emergency_overdose"
  | "drug_sourcing"
  | "smalltalk";
```

If the existing type is generated elsewhere, update the actual source of truth.

- [ ] **Step 3: Teach classifier prompt**

In `supabase/functions/ask/prompts.ts`, add classification guidance:

```ts
"Use intent general_health for common symptom or consumer-health questions when no medication, supplement, trial, or drug label is being asked about. Examples: dandruff, white flakes in hair, dry scalp, acne causes, heartburn, headache, rash. Do not force these into side_effects unless the user names a medication or asks whether a drug caused it.",
```

Expected: "Why do I have white flakes in my hair?" becomes `general_health`, not `side_effects`.

- [ ] **Step 4: Add deterministic topic normalization**

In `supabase/functions/ask/query-understanding.ts`, add a small consumer topic catalog:

```ts
const CONSUMER_TOPICS = [
  {
    normalized: "dandruff",
    aliases: ["white flakes", "flakes in my hair", "dry flakes", "flaky scalp", "white flakes in my hair"],
    biomedical_terms: ["dandruff", "seborrheic dermatitis", "flaky scalp", "scalp scaling"],
    assumptions: ['Interpreting "white flakes in my hair" as a question about dandruff or flaky scalp.'],
  },
];
```

Merge matches into `researchQuery`, `normalizedTerms`, and `assumptions` when no drug mentions exist.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
deno test --allow-env --allow-net supabase/functions/ask/query-understanding.test.ts supabase/functions/ask/consumer-symptom-routing.test.ts
```

Expected: pass.

---

### Task 4: Rebalance Source Selection For General Health

- [ ] **Step 1: Add provider priority**

In `supabase/functions/ask/templates.ts`, update `providerPriorityForIntent`:

```ts
case "general_health":
  return ["medlineplus", "pubmed_oa", "europepmc", "clinicaltrials"];
```

Do not include `openfda` / `dailymed` in this priority list.

- [ ] **Step 2: Stop openFDA/FAERS for no-drug general health**

In `supabase/functions/ask/live-sources.ts`, ensure openFDA already skips when `mentions.length === 0`. Add the same no-drug guard to FAERS:

```ts
{ origin: "faers", fetch: (q, n, mentions) =>
  mentions.length === 0 ? Promise.resolve([]) : fetchFaersReactions({ query: q, retmax: n })
},
```

Expected: no-drug symptom queries do not pull adverse-event reports or drug labels unless a drug was named.

- [ ] **Step 3: Cap label sources to zero for general health**

In `supabase/functions/ask/cite-balance.ts`, add an options object:

```ts
export function balanceCitedSlice(
  ordered: RetrievedChunk[],
  limit: number,
  labelCap: number = LABEL_SLICE_CAP,
): RetrievedChunk[] { ... }
```

Keep signature but call it with `labelCap = 0` from `index.ts` when `cls.intent === "general_health"` and `queryUnderstanding.fieldMentions.length === 0`.

In `supabase/functions/ask/index.ts`:

```ts
const labelCap = cls.intent === "general_health" && queryUnderstanding.fieldMentions.length === 0 ? 0 : undefined;
const aug = await augmentWithLive(question, cls.entity_mentions, ret.chunks, perSourceMax, matchCount, webRecon, labelCap);
```

Update `augmentWithLive` signature:

```ts
labelCap?: number,
```

and use:

```ts
const top = balanceCitedSlice(ordered, matchCount, labelCap).map((c, i) => ({ ...c, tag: String(i + 1) }));
```

- [ ] **Step 4: Add test for label exclusion**

In `supabase/functions/ask/cite-balance.test.ts`, add:

```ts
Deno.test("balanceCitedSlice: labelCap 0 excludes labels when enough non-label evidence exists", () => {
  const ordered = [
    chunk("openfda", "L0"),
    chunk("pubmed_oa", "P0"),
    chunk("medlineplus", "M0"),
    chunk("europepmc", "E0"),
  ];
  const out = balanceCitedSlice(ordered, 3, 0);
  assertEquals(out.map((c) => c.provider), ["pubmed_oa", "medlineplus", "europepmc"]);
});
```

Expected: pass.

---

### Task 5: Improve Citation Support Rating For Main Claims

- [ ] **Step 1: Add failing source-support test**

In `supabase/functions/ask/source-support.test.ts`, add:

```ts
Deno.test("drug label mention is weak when it does not support the main symptom claim", () => {
  const chunks = [
    fakeChunk("openfda", "1", "ISOTRETINOIN label", "Skin and appendages: dry skin, hair abnormalities."),
    fakeChunk("medlineplus", "2", "Dandruff", "Dandruff is flaking of the skin on the scalp. It can be caused by dry skin or seborrheic dermatitis."),
  ];
  const ratings = rateSourceSupport(chunks, {
    what_we_know: [
      { text: "White flakes in hair are commonly dandruff, flaking skin from the scalp.", citation_ids: ["2"] },
    ],
    safety_notes: [],
    clinical_actions: [],
    questions_to_ask: [],
  });
  assertEquals(ratings.get("1")?.claim_relation, "reviewed");
  assertEquals(ratings.get("2")?.claim_relation, "supports");
});
```

Use the actual test fixture helpers already present in the file.

- [ ] **Step 2: Keep non-cited labels as reviewed**

No change may be required if non-cited sources are already `reviewed`; verify this test locks it.

- [ ] **Step 3: Raise consumer-health role weight**

In `source-support.ts`, change MedlinePlus weighting:

```ts
if (provider.includes("medlineplus")) {
  return { role: "consumer_health", weight: 76, reason: "NLM consumer-health guidance." };
}
```

Expected: authoritative consumer-health guidance is no longer visually weaker than generic research metadata for everyday symptom questions.

---

### Task 6: Add Eval Case For White Flakes / Dandruff

- [ ] **Step 1: Add eval case**

In `scripts/diag/mvp-engine-eval-cases.json`, add:

```json
{
  "id": "general_dandruff_white_flakes",
  "question": "Why do I have white flakes in my hair?",
  "mode": "fast",
  "must_include": ["dandruff", "dry scalp"],
  "must_not_include": ["isotretinoin can cause dry skin"],
  "preferred_sources": ["medlineplus", "pubmed_oa", "europepmc"],
  "forbidden_primary_sources": ["openfda", "dailymed"]
}
```

- [ ] **Step 2: Run eval**

Run:

```bash
deno run --allow-net --allow-env scripts/diag/mvp-engine-eval.ts --case general_dandruff_white_flakes
```

Expected: answer mentions dandruff/flaky scalp plainly and does not cite isotretinoin as the main support.

---

### Task 7: Local QA And Deployment

- [ ] **Step 1: Run unit gates**

Run:

```bash
pnpm --filter @pharmaorb/web typecheck
deno test --allow-env --allow-net supabase/functions/ask/query-understanding.test.ts supabase/functions/ask/live-sources.test.ts supabase/functions/ask/cite-balance.test.ts supabase/functions/ask/source-support.test.ts supabase/functions/ask/consumer-symptom-routing.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run local or preview app**

Run:

```bash
pnpm --filter @pharmaorb/web dev -- --port 3100
```

Expected: app starts on `http://localhost:3100`.

- [ ] **Step 3: Browser QA**

Using beta account:

```text
axelgalvez1121@gmail.com
Pizza123!
```

Verify:

- Sign in works.
- Composer mode pill says `Fast` or `Thorough`, not `Fast · live`.
- Ask `Why do I have white flakes in my hair?`.
- Thinking preview is one compact line, not a checklist card.
- Final answer cites consumer-health / PubMed / Europe PMC sources, not isotretinoin DailyMed as the main evidence.

- [ ] **Step 4: Deploy Edge Function**

If the engine code changed, deploy the Supabase `ask` function after env flags are confirmed:

```bash
supabase functions deploy ask --project-ref qyjmivntajbigjswhahb
```

Expected: deployment succeeds and `/ask` uses the new routing.

- [ ] **Step 5: Push web branch and trigger Vercel**

Commit intended changes only:

```bash
git add apps/web/app/app/ask/page.tsx apps/web/app/styles/shell.css apps/web/components/ResearchProgress.tsx apps/web/lib/api.ts packages/shared/src/answer.ts supabase/functions/ask scripts/diag/mvp-engine-eval-cases.json
git commit -m "fix: polish ask thinking and route consumer symptoms"
git push -u origin HEAD
```

Expected: Vercel preview/build goes green.

- [ ] **Step 6: Production QA**

On `https://app.pharmaorb.app/app/ask`, repeat:

```text
Why do I have white flakes in my hair?
```

Expected:

- Chat shows polished thinking preview.
- Answer has plain-English dandruff/flaky-scalp framing.
- Evidence panel ranks consumer-health/literature sources above drug labels.
- If a drug label appears, it is in reviewed/secondary sources, not the main cited support.

---

## Why PubMed Did Not Rank Higher

The current system has PubMed, Europe PMC, OpenAlex, and MedlinePlus in the live source registry, but ranking is not the same as "source quality." The reranker primarily compares text relevance to the user question. For "white flakes in hair," an isotretinoin label can look text-relevant because it contains overlapping terms like dry skin, skin appendages, and hair abnormalities. If the classifier routes the question as side effects or label-ish, the initial provider priority also favors labels. Then generation chooses a citation from the top slice, and citation enforcement checks only that the cited tag exists and supports the sentence at a lexical level.

The fix is not simply "rank PubMed higher." The fix is:

1. Recognize this as a general consumer-health/symptom question.
2. Expand the query to known clinical terms: dandruff, flaky scalp, seborrheic dermatitis.
3. Prefer MedlinePlus/dermatology/literature sources for that route.
4. Exclude FDA labels from primary citation slots unless a drug is named.
5. Make source-support scoring penalize labels that merely mention a related adverse effect.

That gives PubMed/consumer-health sources a fair chance and prevents weak drug-label mentions from anchoring the answer.

