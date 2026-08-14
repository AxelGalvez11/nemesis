# Parser benchmark — LlamaParse vs Mistral vs the existing Nemesis parsers

**Measured 2026-08-13 on the owner's own coursework.** Every number is from a real API call on a
real file, not from documentation. Nothing was replaced; this is the measurement that precedes a
decision.

## Infrastructure, first

**`LLAMAPARSE_API_KEY` is in Supabase Edge Function secrets, and parsing does not run there.**
It runs in the Next.js app on Vercel — `runtime = "nodejs"`, `maxDuration = 300`, with the
"worker" being a worker *thread* inside that same process. This is the same finding as for Mistral
and it has the same answer: an adopted LlamaParse needs its key in **Vercel Preview + Production**.

The benchmark itself ran through a temporary Supabase Edge Function so the key never entered a
transcript. Both probes are now retired stubs returning 410.

🔴 **One hard limit discovered:** a Supabase Edge Function rejects a ~12 MB request body (HTTP 546).
The owner's 10 MB pharmacogenomics deck could therefore **not** be benchmarked through the probe.
That is a limit of the benchmark harness, not of LlamaParse — but it means the deck that started
this conversation is measured for Mistral and the local parser only.

## Modes tested

| requested | resolved `parsingMode` | note |
|---|---|---|
| *(default)* | `accurate` | what you get with no parameter |
| `parse_mode: parse_page_without_llm` | `fast` | cheapest; **returns only `table` items — no `heading`/`text` items at all** |
| `parse_mode: parse_page_with_agent` | `premium` | identical output to `accurate` on the PDF tested |
| `parse_mode: parse_page_with_lvm` | — | **retired by the vendor**: "use `tier` instead — `cost_effective`, `agentic`, `agentic_plus`" |
| `tier: agentic_plus` | — | job returned `ERROR`; not diagnosable from the response |

Pricing, published: 1,000 credits = $1.25. Fast 1 credit/page ($0.00125), Cost-effective 3
($0.00375), Agentic 10 ($0.0125), Agentic Plus 45 ($0.056). 10,000 free credits/month — **every
call in this benchmark reported `job_credits_usage: 0`**, so the observed cost was $0.

Mistral, for comparison: ~$0.002/page, no free tier used.

## Result 1 — PowerPoint with speaker notes

`Safety Event Analysis Final.pptx`, 188 KB, 14 slides. **The file itself declares 13,134 characters
of speaker notes across 14 slides** (read from `ppt/notesSlides/*.xml`).

| | time | units | blocks/items | positioned | chars | speaker notes |
|---|---|---|---|---|---|---|
| **Nemesis (existing)** | **8 ms** | 14 | 141 | 113 | **22,853** | ✅ |
| Mistral | 443 ms | 14 | 110 | 0 | 9,096 | ❌ |
| **LlamaParse** (`accurate`) | 17,366 ms | 14 | 59 | 59 | **22,777** | ✅ **13,134 — exact** |

🔴 **LlamaParse has a first-class `slideSpeakerNotes` field and recovered the declared total
exactly.** This is the single most important result in the benchmark: it is the thing an optical
parser structurally cannot do, and it is why Mistral was rejected for decks. LlamaParse and the
existing parser agree on total content to within 0.3%.

## Result 2 — Word with tables

| file | declares | Nemesis | Mistral | LlamaParse |
|---|---|---|---|---|
| `PK_Activity_-_Student_Copy_2026.docx` | 6 tables | 6 | **0** | **7** (all with `rows`) |
| `Pharmacogenomics problem set.docx` | 2 tables | 2 | 2 | 2 |

Mistral's Word tables arrive as markdown pipes that break apart wherever a cell contains a line
break. LlamaParse returns a `rows` array and an `html` string per table, so merged cells survive.

## Result 3 — PDF, where Mistral won

`Top_300_Community_IPPE_list_and_drug_charts.pdf`, 24 pages.

| | time | words | ligature-corrupted | "contraindication" | tables |
|---|---|---|---|---|---|
| Nemesis (existing) | 1.6 s | 9,098 | **60** (39 spellings) | 34 | 22 |
| LlamaParse `accurate` | 42.1 s | 9,656 | **60** (39 spellings) | 36 | 28 |
| LlamaParse `premium` | 29.3 s | 9,656 | **60** | 36 | 28 |
| **Mistral** | 4.9 s | **16,823** | **0** | **64** | 28 |

🔴 **LlamaParse reproduces the exact same corruption as our own parser** — `ac1on`, `indica1ons`,
`contraindica1ons` — at every tier that ran. It is reading the PDF's text layer, so it inherits the
broken ligature mapping. Only Mistral, which renders the page and reads the pixels, escapes it.

## Result 4 — through the real Nemesis normalization layer

A LlamaParse adapter was written and each output run through the **actual** persistence envelope,
`storedDocumentModel`, `sourceContextFromModel`, `extractKnowledgeObjects` and `citeQuote`.

| file | envelope round-trip | quality gate | citation | knowledge objects |
|---|---|---|---|---|
| safety.pptx | SURVIVED | PASS | **RESOLVES** + locator valid | **0** |
| pk-activity.docx | SURVIVED | PASS | **RESOLVES** + locator valid | **0** |
| problem-set.docx | SURVIVED | PASS | **RESOLVES** + locator valid | **0** |

**Adapter size, measured in lines of code (comments and blanks excluded):**

| | code lines |
|---|---|
| `llamaparse-model.ts` | **101** |
| `mistral-model.ts` + `mistral-tables.ts` | **493** |

LlamaParse needs about **one fifth** the normalization code, because it returns typed items with a
level on every heading, a `rows` array on every table, and a `bBox` on everything. Mistral returns
page markdown whose tables hide behind `[tbl-N.html]` references in three shapes depending on
format, so its adapter must parse markdown, resolve references, read HTML into cells, and carry a
pipe-table fallback.

## 🔴 The finding that outranks all of the above

**Knowledge objects: 0. On every file. With every parser.**

Three independent extractors now deliver clean, structured, citable documents into
`extractKnowledgeObjects`, and it returns nothing. The refusals name the reason:

> `table-not-pairs` — *"A 4-column table is a matrix rather than a list of pairs, so no association
> was taken from it."*

The drug chart alone holds **561 candidate facts** across 27 tables of 8–11 columns, with real
column names (*Indications*, *Drug-Drug Interactions*, *Monitoring/Contraindications*). Nemesis
takes none of them, because the knowledge layer only understands two-column tables.

Parser quality is not the constraint on what Nemesis can learn. This is.

## Recommendation

**Hybrid, and it is not a compromise — the two vendors fail in opposite directions.**

| format | primary | why |
|---|---|---|
| **PDF** | **Mistral** | the only one that escapes the ligature corruption: 16,823 words with 0 broken against 9,098–9,656 with 60 |
| **PPTX** | **LlamaParse** | `slideSpeakerNotes`, recovered exactly; matches the existing parser's total content |
| **DOCX** | **LlamaParse** | 7 tables where Mistral returns 0 |
| XLSX / CSV / images | unchanged | a spreadsheet's exact cells cannot be improved on by an optical read |

**Does this retire meaningful parser maintenance? Yes — for Office, genuinely.** The Office readers
(`office.ts`, `pptx-model.ts`, the DOCX structure reader) are where format edge cases accumulate:
SmartArt, merged cells, notes, charts. LlamaParse matching them on content is the qualifying
condition for handing that over, and its adapter is 101 lines.

**Two costs to accept, stated plainly:**

1. **Latency.** LlamaParse took 17 s for 14 slides and 42 s for 24 pages, against 8 ms and 1.6 s
   locally. The 300 s budget absorbs it, but a student waits through it on the upload path. A very
   large deck may not fit at all.
2. **A second vendor.** Two providers is more surface than one. The alternative is one provider
   that is measurably wrong on one of the two document classes.

**What is NOT recommended:** adopting LlamaParse for PDF. It is our own parser's output with a
network call in front of it.
