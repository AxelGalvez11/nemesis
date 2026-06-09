# PharmaOrb Experiment Planner — "from evidence to experiment" (vision / P6)

> **Status:** PLAN / north-star. The most ambitious capability, downstream of an excellent
> evidence engine. Research-grade (not clinical-decision-grade) — different users, different rigor.
> Captured now so the architecture is intentional; build is a later phase.

## The ask (owner, 2026-06-08)
Given a hypothesis about a drug, can the app know what lab techniques to use and **plan an entire
wet-lab process to test it** — assays, models, controls, reagents, protocol?

## The non-negotiable principle
**Never invent protocols.** An LLM free-styling a wet-lab protocol is unreliable and unsafe. The
defensible, powerful design is **literature-grounded experimental design**: propose the methods that
*real studies actually used* to test similar hypotheses, cited — then let a scientist validate.

## Architecture (rides on the same retrieval + grounding machinery as the clinical engine)
1. **Hypothesis intake** — parse the claim into entities + relationships (drug → mechanism/target →
   effect → model system). Reuse entity resolution.
2. **Methods retrieval** — the key enabler is **Europe PMC full text** (already wired as a live
   source): pull the **Methods** sections of papers that tested the same/adjacent hypothesis. Add
   protocol databases: **protocols.io** (open API), **Bio-protocol**, **Nature Protocols**, **JoVE**.
3. **Technique & design synthesis** — from what those papers used, propose: assay(s) (e.g. Western
   blot, ELISA, qPCR, viability/IC50, flow), model system (cell line, primary, organoid, animal),
   controls (positive/negative/vehicle), readouts, sample size / power considerations, and
   tradeoffs — each grounded in cited prior work.
4. **Reagents & resources** — point to obtainable materials: **Addgene** (plasmids), antibody
   registries, **PubChem / ChEMBL** (compounds, bioassays), cell-line repositories (ATCC/Cellosaurus).
5. **Draft protocol output** — a structured, step-wise protocol **clearly marked DRAFT**, every
   choice cited, with explicit feasibility/safety/ethics caveats (biosafety level, IACUC/IRB where
   relevant). Output as a deliverable (doc → exportable protocol).

## Safety / rigor guardrails
- Research-grade, **draft for a scientist to validate** — never "validated protocol."
- Every technique/parameter cited to real literature or a protocol database; flag where evidence is
  thin or extrapolated.
- Surface safety/regulatory gates (biosafety, animal/human approvals) rather than gloss them.
- The deterministic-stats rule applies: any power/sample-size/IC50 math is computed in real code,
  not LLM-guessed (same rule as the clinical calculators + meta-analysis).

## Why it's the natural payoff
It reuses everything already built: the retrieval engine, Europe PMC full-text, citation/grounding
discipline, the deliverables pattern, and the "compute-in-real-code" rule. Making the evidence engine
excellent first is the prerequisite — the planner is only as good as the methods literature it can
find and ground in.

## Build sketch (own phase, after the clinical layer ships)
- `methods-retrieval` (Europe PMC full-text Methods + protocols.io API) →
- `experiment-design` synthesizer (assays/models/controls/reagents, cited) →
- `protocol` deliverable renderer (structured, DRAFT-stamped, exportable) →
- eval: a panel of known hypotheses with known good experimental approaches, scored for
  groundedness + appropriateness (the Skeptic gates it, like every other phase).

## Non-goals (for the first version)
Autonomous protocol assertion; anything presented as ready-to-run without scientist validation;
techniques not grounded in retrievable literature.
