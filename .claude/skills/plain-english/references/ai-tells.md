# The full tell lists

Source: Wikipedia's *Signs of AI writing*, maintained by the WikiProject AI Cleanup editors, plus
*Make technical articles understandable*. Kept here in full so `SKILL.md` can stay short.

Retrieved 2026-08-24. The vocabulary drifts as models change — treat the dated clusters below as
history, not as a fixed blocklist, and trust the structural tells over any single word.

---

## 1. Vocabulary clusters, by era

The diagnostic is **density, not presence**. Any one of these words is ordinary English.

**2023 – mid-2024**
additionally · boasts · bolstered · crucial · delve · emphasizing · enduring · garner · intricate ·
intricacies · interplay · key · landscape · meticulous · meticulously · pivotal · underscore ·
tapestry · testament · valuable · vibrant

**mid-2024 – mid-2025**
align with · bolstered · crucial · emphasizing · enhance · enduring · fostering · highlighting ·
pivotal · showcasing · underscore · vibrant

**mid-2025 onward**
emphasizing · enhance · highlighting · showcasing — plus the notability words in §3

**Grok in particular**
causal · empirical · correlate · underscore

---

## 2. Significance and legacy inflation

Sentences that assert importance while adding no fact.

stands as · serves as · is a testament to · is a reminder of · crucial · pivotal · vital ·
significant · key role · key moment · underscores its importance · highlights its importance ·
reflects broader · symbolizing its ongoing · enduring legacy · lasting impact · contributing to the ·
setting the stage for · marking a shift · shaping the · represents a shift · key turning point ·
evolving landscape · focal point · indelible mark · deeply rooted

Examples flagged by editors:

- "marking a pivotal moment in the evolution of regional statistics"
- "represented a significant shift toward regional statistical independence"
- "highlights the enduring legacy of the community's resistance"

---

## 3. Notability and coverage padding

independent coverage · local media outlets · regional media outlets · national media outlets ·
trade publications · profiled in · written by a leading expert · maintains an active social
media presence

---

## 4. Superficial analysis, usually as a trailing participle

highlighting · underscoring · emphasizing · ensuring · reflecting · symbolizing · contributing to ·
cultivating · fostering · encompassing · enhancing · valuable insights · align with · resonate with

Example: "…creating a lively community within its borders, further enhancing its significance as a
dynamic hub…"

---

## 5. Promotional / travel-brochure register

boasts a · vibrant · rich · profound · enhancing · showcasing · exemplifies · commitment to ·
natural beauty · nestled · in the heart of · groundbreaking · renowned · featuring · diverse array ·
offers a fascinating glimpse into · breathtaking

---

## 6. Vague attribution

industry reports · observers have cited · experts argue · some critics argue · several sources ·
several publications · studies show · it is widely considered · researchers and conservationists

Also: "such as" introducing a list that is actually exhaustive.

---

## 7. Copula avoidance

Measured drop of 10%+ in "is/are" in post-2023 text.

| Avoided | Substituted |
| --- | --- |
| is | serves as a · stands as · marks · functions as · operates as · represents a |
| has | boasts · features · maintains · offers |
| is (in a lead) | refers to |
| was | ventured into politics as · began his career as |

---

## 8. Vague connection language

in connection with · connected with · connected to · in association with · associated with ·
particularly associated · widely associated

---

## 9. Negative parallelism

- **Not just X, but also Y** — "not only a work of self-representation, but a visual document of her obsessions"
- **Not X, but Y** — "not a mirror but a portal"; "no rules, no limits, just…"
- **X rather than Y** — "prioritizing empirical consolidation rather than ideological purity" (common in Grok)

---

## 10. The formulaic closing section

"Challenges and Future Directions" · "Despite its success, X faces challenges, including…" ·
"Despite these challenges, X continues to…" · "Future investments in technology could enhance…"

---

## 11. Style and formatting tells

- Overuse of em dashes in place of full stops or commas
- Overuse of boldface, often on the vocabulary-cluster words
- Title Case where sentence case belongs
- Headings that contain only other headings
- Skipped heading levels (H2 straight to H4)
- Overuse of level-1 headings
- Inline-header vertical lists
- Emoji as section markers
- Tables where prose is standard
- Curly quotes and apostrophes pasted from model output
- Unnecessary horizontal rules between sections
- Markdown syntax surviving into a non-Markdown destination

---

## 12. Leftover machine artefacts

Search for these before publishing anything pasted from a model.

| Model | Artefact strings |
| --- | --- |
| ChatGPT | `contentReference` · `oaicite` · `oai_citation` · `turn0search0` · `attributableIndex` · a stray `+1` |
| Gemini | `[cite: 1]` · `[span_1](start_span)` |
| Grok | `grok_card` · `grok_render_citation_card_json` |
| DeepSeek | lenticular brackets `【】` · dagger symbols |
| Perplexity | `attached_file` · `ppl-ai-file-upload` |
| unclassified | `:::writing` |

Also: knowledge-cutoff disclaimers, visible refusal text, unfilled `[placeholders]`, and text
addressing the reader as though mid-conversation.

---

## 13. Citation tells

Broken external links · invalid DOIs and ISBNs · DOIs resolving to unrelated articles · book
citations with no page number or URL · `utm_source=` tracking parameters left in URLs · named
references declared but never used.

---

## 14. Historical tells, mostly gone

Kept because older text still carries them: didactic disclaimers ("This is a point I should
clarify"), a summary sentence closing every section, visible prompt refusals, text stopping
mid-word, access dates matching a model's cutoff, and obsessive synonym substitution to avoid
repeating a word (elegant variation).

---

## 15. What human writing looks like, by contrast

- Predates November 2022
- The writer can explain why they made a specific choice
- Syntax varies and is not formulaic
- Word choices are specific to the context rather than drawn from the cluster
- Repeats a word when the word is correct

---

## 16. Understandability rules

From *Make technical articles understandable*.

- **One level down.** Write for readers one educational stage below where the topic is taught.
- **Define before use.** Expand acronyms on first use; never define circularly; check ordering.
- **Everyday word wins** when it means the same thing.
- **~12 words average** per sentence, with deliberate variation.
- **Front-load** the accessible material; let later sections get harder.
- **One concrete example** beats another abstract claim. Contrasting examples help.
- **Explain formulas in words** — why they have the shape they have — and define every variable.
- **Lead summarises, body details.**
- **Hedge honest simplifications** with "roughly" or "with some exceptions", then give the accurate
  version. Avoid lies-to-children: an oversimplification the reader will have to unlearn.
- Break long paragraphs. Use bullets for genuinely parallel items, never for paragraph-length text.
- Use visuals with real captions.
