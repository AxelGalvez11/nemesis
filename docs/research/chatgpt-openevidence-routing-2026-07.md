# How ChatGPT & OpenEvidence route questions — and how to un-rigid our engine
*Researched 2026-07-05 · Live browser observation (ChatGPT Plus, OpenEvidence, Manus) + 5-agent web research sweep (125 tool calls) · Confidence: High on observed behavior, Medium on vendor internals*

## Executive summary

The owner's complaint — "our question engine is rigid; ChatGPT understands when a question is casual vs when it needs cited research" — is confirmed and now fully explained. ChatGPT does NOT use a rigid pre-classifier that forces every question down one pipeline. It uses (1) a **router** that picks how much reasoning to spend per message, and (2) a model that **holds a search tool and decides for itself, mid-reasoning, whether and how much to search**. A dinner question and a drug-safety question typed into the same chat with the same settings got completely different treatment with zero visible mode switching (verified live in the owner's own ChatGPT account today). OpenEvidence solves the same problem differently: a closed 35M-article corpus, an ensemble of ~6 specialized models, and free-text clinical question understanding — but its scope is physician-only Q&A, so it never has to handle "what's for dinner."

The production-proven fix for our rigidity is the **classify-then-route-to-depth-tier** pattern (Adaptive-RAG, Perplexity, Gemini all converge on it): a cheap router in front assigns each message to one of 3 tiers — no-retrieval chat / single-shot cited research / multi-step deep research — with our deterministic safety scan staying on **every** tier. Adaptive-RAG's published numbers: ~96% of full-pipeline quality at ~41% of the latency.

---

## 1. Live observations (owner's Chrome, 2026-07-05)

### Test 1 — casual question, ChatGPT (Plus, effort "High")
"what should i make for dinner tonight? i have chicken, rice and some peppers"
- Header: "Thinking" → collapsed to **"Thought for a few seconds ›"**. **No search. No citations.**
- Answer: direct, conversational, bold lead-ins, numbered steps, ends with a personal "My pick: …" recommendation. No hedging, no disclaimer block.

### Test 2 — medication-safety question, same account/settings
"is it safe to take ibuprofen daily for my knee if im also on lisinopril… what does the evidence say"
- **First-person intent line streams immediately, before any answer**: "I'll ground this in current drug-safety guidance and clinical evidence, then translate it into a practical "what to do for knee pain" plan." This line **stays visible above the answer permanently**.
- Below it, dimmed raw-reasoning snippets stream and replace each other ("I'm thinking of recommending avoiding diure…", "I'm wondering if I should avoid directly opening the PDF…").
- Model **decided on its own** to run multi-source web search (NCBI, PMC, FDA, NHS, AAFP domains). Total: "Thought for 46s".
- Answer format: **bold one-sentence verdict first**, then "The evidence says three main things:" numbered list, **key numbers bolded**, inline **favicon citation pills** at claim ends ("◐ Best Practice Ad… +1", "◐ PMC +1", "Mayo Clinic"), practical plan paragraph, bolded red-flag list.
- Footer: action icons + **stacked favicons + "Sources" button** → opens right drawer.

### The Activity panel (right drawer, "Activity · 46s") — spec to copy
Alternating block types under a "Thinking" heading:
1. **Search block**: globe icon + gerund title ("Browsing medical information on NSAIDs, ACE inhibitors, and more", "Searching FDA domain sources for further information") + rows of **favicon+domain chips** (www.ncbi.nlm.nih.gov, bpac.org.nz…) + overflow chip "**17 more**" with stacked mini-favicons.
2. **Reasoning block**: bullet dot + bold title ("Looking up knee osteoarthritis treatment guidelines") + first-person paragraph ("I'm thinking I need to find guidelines… Let me see what the official treatment guidelines suggest.").

### Key routing insight (the whole ballgame)
Same chat, same settings, no user toggle. The difference in treatment came entirely from the model's own judgment about the question. ChatGPT's flexibility = **the decision to search lives INSIDE the answering model's reasoning loop**, not in a rigid upstream classifier. OpenAI's own docs confirm: "the model can choose to search the web or not based on the content of the input prompt"; reasoning models "perform web searches as part of chain of thought, analyze results, and decide whether to keep searching."

### OpenEvidence live
- Anonymous use allowed for the question; answer partially **blur-gated** (full access = NPI-verified clinicians).
- Activity trail is ONE line: "Analyzed query, searched for evidence ›". Far less theater than ChatGPT — their trust comes from the corpus, not the trail.
- Answer opens with a direct verdict sentence ("The evidence suggests that metformin likely reduces…, though the strength of evidence is debated…"), then structured sections ("Key Randomized …").
- Prominent **Follow-Up Questions card** (3 suggested next questions with chevrons) — good retention pattern we don't have.
- Top banner: "OpenEvidence has signed content agreements with **NEJM, JAMA, NCCN, Wiley, Cochrane**" — trust-by-brand-association, always visible.
- Composer chips are **task-shaped, not topic-shaped**: "Write a Prior Auth Letter", "Research a Topic", "Ask for Evidence".

### Manus live (design-token probe via DOM)
- body bg `rgb(36,36,36)` #242424 · sidebar bg `rgb(31,31,31)` #1f1f1f · text `rgb(218,218,218)` #dadada · font: system-ui stack · base 16px.
- Run view verified: user bubble top-right; agent avatar + wordmark + tier chip ("Lite"); first-person ack; **plan checklist with check bullets inside the ack message**; pinned current-step row above composer ("✓ Deliver the report and slides to the user — 6/6 ⌄"); composer "Message Manus" with +/tools/screen icons; "Task completed" green row; file deliverable cards (icon, name, "Markdown · 253.82 KB"); "View all files in this task"; 5-star "How was this result?"; typed follow-up suggestion rows with per-type icons.
- **Our app vs live Manus**: structure matches (sidebar nav, centered prompt, composer, chips). Main measurable delta: **our background has a blue-navy tint; Manus is neutral warm dark (#242424/#1f1f1f)**. Our serif display heading is a brand divergence (Manus uses serif only as accent, e.g. share card).

---

## 2. How ChatGPT routes (July 2026, researched)

- **GPT-5.x real-time router**: unified system = fast model (gpt-5-main) + reasoning model (gpt-5-thinking) + router choosing per-message on: conversation type, task complexity, tool needs, explicit intent ("think hard about this"). Router is **continuously trained on live usage signals** (model-switch/regenerate events, preference rates, measured correctness). [GPT-5 System Card]
- **Search is a second, independent decision** made by the model itself mid-reasoning (agentic search loop, no fixed search count; effort level scales sub-query count ~5.5 → ~24 per prompt from minimal → high). [OpenAI dev docs; Search Engine Land]
- Field data: ~18% of all ChatGPT conversations trigger ≥1 search; citation rate 50% → 68% moving minimal → high reasoning; **health queries get one of the largest citation lifts (+24pp)** under high reasoning. Turn 1 is ~2.6–4× more likely to cite than turns 10–20. [Profound; Search Engine Land]
- **ChatGPT Health / ChatGPT for Clinicians** (Apr 2026, free, NPI-verified): retrieves peer-reviewed literature/guidelines/pathway docs with citations; HealthBench-evaluated; built with 260+ physicians. BUT independent Mount Sinai eval (Feb 2026) found it **under-triaged >half of physician-deemed emergencies** — deterministic safety remains our moat, don't copy their approach there.
- **Deep Research stays a user-selected mode** (button/picker, 5–30 min, editable plan). The router never silently escalates a chat message into Deep Research. Same as our product decision (dial = depth only). ✓
- Citation rendering internals: response streams private-use Unicode placeholders that the client swaps for favicon pills as metadata arrives — that's how pills appear mid-stream without layout jank.

## 3. How OpenEvidence works (researched)

- **"Cooperative ensemble" of ~6 specialized models** (retrieval, ranking, synthesis) — not one frontier LLM (Nadler, Sequoia podcast).
- **Closed corpus**: 35M+ peer-reviewed articles + FDA/CDC public domain. No open-web retrieval — their core hallucination defense. Licensed full text: NEJM (Feb 2025, back to 1990), JAMA Network (Jun 2025, 11 specialty journals), NCCN, AMA, AAFP.
- Ranking: relevance + pub date + journal impact factor + citation count; sources labeled "Highly Relevant" / "Leading Journal" / "New Research", plus a "Why was this source cited?" explainer — **very copyable trust features**.
- Question understanding: free-text clinical shorthand, roughly PICO-mapped; **Dotflows** (Apr 2026) = user-defined "." templates controlling answer style/context — user-programmable NLU, clever rigidity escape valve.
- Stack: Next.js on Vercel + Python on GCP + Baseten inference (embedding latency 700→160ms). DeepConsult = their multi-agent deep-research product, free to verified clinicians.
- Scale: ~20M consultations/month (Jan 2026), ~40% of US physicians registered, $12B valuation (Series D Jan 2026), ~$700M raised. Free-to-clinician, pharma-ads monetization.
- Live dispute: June 2026 Nature Medicine paper (NYU) claims frontier general LLMs beat OpenEvidence/UpToDate on medical benchmarks; OpenEvidence publicly disputes (contamination/COI claims). Unresolved.

## 4. github.com/synthetic-sciences/openscience (researched + verified via gh)

- **Real, public, Apache-2.0**, created **2026-07-03 (2 days old)**, 104★, very active. By Synthetic Sciences — 2-person YC W26 startup (Aayam Bansal, Ishaan Gangwani).
- What it is: open-source **AI workbench for scientific research** — Claude-Code-style local agent (Bun+Hono server, SolidJS browser workspace) with `research`/`biology`/`physics`/`ml` agents, 250+ skills, and **~30 scientific database connectors** (UniProt, PDB, Ensembl, ChEMBL, PubChem, arXiv, OpenAlex, Semantic Scholar). BYOK model-agnostic; paid managed layer "Atlas" is closed and NOT in the repo.
- Relevance to us: **not a competitor to the PharmaOrb product** (it's a researcher's local workbench, not a consumer/clinician answer engine). Value = **pattern library**: their `backend/cli/src/science/connectors/{literature,chemistry,genomics,…}` connector architecture is clean and Apache-licensed — a good template if/when we add OpenAlex/Semantic Scholar retrieval breadth. No clinical sources (no openFDA/DailyMed/ClinicalTrials) — we'd write our own connectors in their pattern. Worth a GitHub watch; too new (2 days) to bet on.

## 5. The fix for our rigid engine (recommendation)

Production consensus (Perplexity funnel, Gemini dynamic-retrieval score, Claude tool-choice, Adaptive-RAG paper):

**Put a cheap 4-lane router in front; keep deterministic safety on every lane.**

- **Lane 0 — Conversational** (greetings, opinions, cooking, chitchat, meta-questions about the app): answer directly from the model, no retrieval, no citation pills. We already have a small-talk short-circuit — broaden it into a real lane.
- **Lane 0.5 — Fresh/general info** (owner's addition 2026-07-05: "who is Matt Turner", "what are the World Cup times?"): recent-events and named-entity questions that our medical corpus can NOT answer and the model's weights answer stale. Needs a general web-search retrieval path (new capability — today the engine would either force-fit medical sources or answer blind). Options: (a) add a web-search tool lane (Bing/Brave/Exa API) with the same cite-what-you-used rendering, or (b) honest degradation ("this needs live web info — that's outside my evidence library") until (a) ships. ChatGPT's tell for this lane: recency words, proper nouns outside the medical namespace, sports/news/people intents.
- **Lane 1 — Evidence question** (default): current single-pass pipeline (retrieve → rerank → generate → safety scan) exactly as today.
- **Lane 2 — Deep research**: stays explicit user mode (matches ChatGPT; never auto-escalate).
- **Safety backstop (ask-v10 deterministic scan) runs on ALL tiers including Tier 0** — this is our moat; ChatGPT's under-triage findings prove why it can't be probabilistic.
- Router implementation options, cheapest first: (a) embedding-similarity classifier (16–100ms, 92–96% precision reported), (b) small fine-tuned classifier, (c) LLM-mini catch-all only for low-confidence. Confidence rule of thumb: >0.8 auto-route; <0.5 escalate to next-more-expensive decider. When unsure between Tier 0 and Tier 1 → **choose Tier 1** (over-citing is safer than under-citing for us).
- Guard rails from the failure-mode literature: hard iteration caps (~3 retrieval cycles), per-request tool budgets, explicit stop conditions — prevents "tool storms"/"retrieval thrash".
- Evidence it's worth it: Adaptive-RAG = F1 46.94 @ 3.60s vs always-multi-step 48.85 @ 8.81s (≈96% of quality, 41% of latency). Our "is celsius lethal"-style over-routing is exactly the over-retrieval failure mode this kills.

## 6. Thinking-preview deltas to copy (vs our shipped trail)

Shipped (d4f24e5): thinking activity trail + favicon pills + Sources button. Observed gaps vs live ChatGPT today:
1. **Persistent first-person intent line** above the answer ("I'll ground this in… then translate it into…") — streams first, never disappears. We don't have this; it's the single highest-value piece of the theater.
2. **Live dimmed reasoning snippets** that replace each other under the intent line while working.
3. Collapsed header wording: "Thought for a few seconds" / "Thought for 46s" (not "Thinking…" once done).
4. Activity panel = **alternating search blocks (globe + gerund title + favicon domain chips + "N more" overflow)** and **reasoning blocks (bullet + bold title + first-person paragraph)**.
5. Inline pills show source name truncated + "+1" merge count; Mayo Clinic style single-name pill when one source.
6. OpenEvidence-style **Follow-Up Questions card** after answers (3 suggestions) — cheap retention win.
7. OpenEvidence trust labels on sources ("Leading Journal", "New Research", "Why was this source cited?") — fits our evidence-trust layer perfectly.

## 7. Manus parity checklist (from live compare)

- [ ] Neutralize background hue: body #242424, sidebar #1f1f1f, text #dadada (ours currently blue-tinted).
- [x] Sidebar structure, centered prompt, composer chips — already match.
- [ ] Pinned current-step row above composer with n/n progress + chevron (verify ours matches this exact anatomy in agent runs).
- [ ] File deliverable cards with type + size line, "View all files in this task".
- [ ] Post-completion star rating + typed follow-up suggestion rows.
- Note: Meta's $2B Manus acquisition was ordered unwound by China's NDRC (Apr 2026) — product direction uncertain; don't chase their UI as a moving target beyond this parity pass.

## 8. openscience SOURCE audit (2026-07-05, local clone at ~/Desktop/AIcodingProjects/reference/openscience)

Verdict: **read-for-ideas / do-not-port.** Runtime mismatch is total (Bun-native local CLI with shell/LaTeX/Python access vs our Vercel + Supabase edge functions). No telemetry/phone-home; clean BYOK project. Specific findings:

- **Connectors** (`backend/cli/src/science/connectors/`, 39 connectors, 7 literature: pubmed, europepmc, biorxiv, crossref, openalex, semantic-scholar, arxiv): tiny uniform `Connector{search,fetch}` interface + one registry; the LLM sees only TWO tools (`science_list_dbs`, `science_search`) regardless of connector count — nice anti-tool-bloat pattern. All plain Web APIs, Deno-portable except 3 `process.env` lines. BUT: no cross-source reranking, no pagination anywhere — **our existing core-source-sync providers are more mature** (license classification, cross-provider dedup). Port nothing; keep the registry idea + their `http.ts` retry/backoff shape.
- **UI patterns worth copying conceptually** (`frontend/ui/src/components/session-turn.tsx` etc., SolidJS so patterns-not-code):
  1. **Content-derived, debounced status line**: live status = last tool mapped to a verb phrase, or the model's own **bold** lead phrase regexed from its reasoning stream; changes debounced to ≥2.5s to kill flicker. Better than our fixed-timer stages long-term.
  2. Registry-based collapsed tool-call cards (icon + title + subtitle, expandable; tools self-register renderers).
  3. Sticky "N steps · Ns elapsed" progress row while in flight.
  4. Artifact envelope `{kind, data}` + kind→renderer map for inline deliverables (fits our poster/report cards).
  5. Nested sub-run rendering for research fan-out (fits Deep Research/Missions).
- **Skills prose as rubrics** (rewrite, don't lift — Apache-2.0 NOTICE overhead in a closed product): research-lookup's venue-tier + citation-count-by-age source-scoring rubric; clinical-reports' GRADE/CONSORT structure checklists; poster skills' word-count/60-70%-visual heuristics for our ResearchPoster.tsx.
- Audit gap: the agent-runtime/SSE deep-read returned junk output (agent failure) — streaming event-shape details unverified; UI-layer findings above cover the render side.

## Sources (key)
1. GPT-5 System Card — openai.com/index/gpt-5-system-card (router design)
2. OpenAI web-search tool docs — developers.openai.com/api/docs/guides/tools-web-search (model decides to search)
3. Profound — tryprofound.com/blog/chatgpt-citation-sources (18% search rate, turn decay)
4. Search Engine Land — reasoning mode citation analysis (50→68%, health +24pp)
5. Simon Willison — simonwillison.net/2025/Sep/6/research-goblin/ (agentic search behavior)
6. Sequoia Training Data podcast, Daniel Nadler (ensemble architecture)
7. Contrary Research — research.contrary.com/company/openevidence (ranking factors, business)
8. Sacra / TechCrunch (OpenEvidence scale & funding)
9. Adaptive-RAG — arxiv.org/html/2403.14403v2 (3-tier router numbers)
10. vLLM Semantic Router / RouteLLM / NVIDIA LLM Router (open-source router implementations)
11. Agentic RAG failure modes — towardsdatascience.com (tool storms, caps)
12. synthetic-sciences/openscience — GitHub API verification, README, ARCHITECTURE.md
13. Live observation session 2026-07-05: chatgpt.com (2 experiments), openevidence.com (1 query), manus.im (run view + DOM probe), app.pharmaorb.app (side-by-side)

## Methodology
5 parallel research agents (ChatGPT routing, OpenEvidence, openscience repo, adaptive-routing literature, competitor thinking-UX), 125 tool calls, ~30 deep-read sources, cross-checked against live hands-on browser testing in the owner's Chrome. Vendor-internal claims marked medium confidence where only self-reported.
