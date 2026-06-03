# Low-Fidelity Wireframes — PharmaBro

These are text wireframes. Convert them into Figma screens before development.

## 1. Welcome

```text
 ------------------------------------------------
| PharmaBro                                      |
| Medication answers with receipts.             |
|                                                |
| Understand drugs, labels, trials, and evidence |
| in plain English.                              |
|                                                |
| [Get Started]                                  |
| [Continue as Guest]                            |
|                                                |
| Educational information only.                  |
 ------------------------------------------------
```

## 2. Interest selection

```text
 ------------------------------------------------
| What do you want to follow?                    |
|                                                |
| [ ] Weight loss drugs                          |
| [ ] Peptides                                   |
| [ ] Supplements                                |
| [ ] Clinical trials                            |
| [ ] Blood pressure meds                        |
| [ ] Diabetes meds                              |
| [ ] Psychiatry meds                            |
| [ ] Pharmacy study mode                        |
|                                                |
| [Continue]                                     |
 ------------------------------------------------
```

## 3. Ask tab

```text
 ------------------------------------------------
| Ask                                            |
|                                                |
| What do you want to know?                      |
| [Can I take ibuprofen with lisinopril?      ]  |
|                                                |
| Quick prompts                                  |
| - Compare semaglutide vs tirzepatide           |
| - What is BPC-157?                             |
| - Explain SSRIs                                |
| - Show retatrutide trials                      |
|                                                |
| Recent                                         |
| [Sertraline warnings]                          |
| [Creatine evidence]                            |
 ------------------------------------------------
```

## 4. Answer screen

```text
 ------------------------------------------------
| Can I take ibuprofen with lisinopril?          |
|                                                |
| Evidence grade: Strong for known interaction   |
|                                                |
| Plain-English answer                           |
| NSAIDs like ibuprofen can sometimes reduce...  |
|                                                |
| What we know                                   |
| - Point 1 [DailyMed]                           |
| - Point 2 [PubMed]                             |
|                                                |
| What we do not know                            |
| - Your individual risk depends on...           |
|                                                |
| Ask your clinician/pharmacist                  |
| - Is short-term use okay for me?               |
| - Should kidney function be monitored?         |
|                                                |
| [Open Sources] [Save] [Follow Topic]           |
 ------------------------------------------------
```

## 5. Explore home

```text
 ------------------------------------------------
| Explore                                        |
| [Search drugs, trials, classes...]             |
|                                                |
| Popular now                                    |
| [Ozempic] [Mounjaro] [Zepbound]                |
| [Retatrutide] [BPC-157] [Creatine]             |
|                                                |
| Medication classes                             |
| [GLP-1s] [SSRIs] [ACE inhibitors]              |
|                                                |
| Trending clinical trials                       |
| [Obesity] [Alzheimer's] [Oncology]             |
 ------------------------------------------------
```

## 6. Drug page

```text
 ------------------------------------------------
| Retatrutide                         [Follow]   |
| Investigational | GLP-1/GIP/glucagon agonist   |
| Evidence: Moderate human trial evidence        |
|                                                |
| Overview                                       |
| Retatrutide is an investigational drug...      |
|                                                |
| Tabs                                           |
| [Summary] [Evidence] [Trials] [Risks] [Sources]|
|                                                |
| Key facts                                      |
| Mechanism: ...                                 |
| Approved: No                                   |
| Trials: Phase 3                                |
| Known risks: GI effects, etc.                  |
| Unknowns: long-term safety, etc.               |
|                                                |
| [Ask AI about this] [Compare]                  |
 ------------------------------------------------
```

## 7. Watchlist

```text
 ------------------------------------------------
| Watchlist                                      |
|                                                |
| Free plan: 3/3 followed items                  |
| [Upgrade for unlimited]                        |
|                                                |
| ⭐ Retatrutide                                  |
| New ClinicalTrials.gov update                  |
|                                                |
| ⭐ BPC-157                                      |
| New PubMed review found                        |
|                                                |
| ⭐ Semaglutide                                  |
| FDA/DailyMed label update detected             |
|                                                |
| [Add item]                                     |
 ------------------------------------------------
```

## 8. Source viewer

```text
 ------------------------------------------------
| Source Viewer                                  |
| Source: DailyMed                               |
| Section: Warnings and Precautions              |
| Published/updated: 2026-xx-xx                  |
|                                                |
| Why this source matters                        |
| This is FDA-submitted labeling currently...    |
|                                                |
| Relevant section summary                       |
| ...                                            |
|                                                |
| [Open original source]                         |
 ------------------------------------------------
```

## 9. Medication class page

```text
 ------------------------------------------------
| SSRIs                              [Follow]    |
| Selective serotonin reuptake inhibitors        |
|                                                |
| How they work                                  |
| SSRIs increase serotonin signaling by...       |
|                                                |
| Common drugs                                   |
| Sertraline, fluoxetine, escitalopram...        |
|                                                |
| Common side effects                            |
| Nausea, insomnia, sexual dysfunction...        |
|                                                |
| Serious risks                                  |
| Serotonin syndrome, suicidality warning...     |
|                                                |
| [Compare with SNRIs] [Ask about SSRIs]         |
 ------------------------------------------------
```

## 10. Profile / My Health Context

```text
 ------------------------------------------------
| My Health Context                              |
| Optional. Used to make educational answers     |
| more relevant. Not diagnosis or treatment.     |
|                                                |
| Age range: [ ]                                 |
| Sex: [ ]                                       |
| Allergies: [Add]                               |
| Medications: [Add]                             |
| Supplements: [Add]                             |
| Conditions: [Add]                              |
| Kidney/liver disease: [Yes/No/Unknown]         |
|                                                |
| [Save] [Delete My Health Context]              |
 ------------------------------------------------
```

## Figma conversion checklist

- Create mobile frame for iPhone and Android.
- Build reusable components: drug card, evidence badge, citation pill, watchlist row, comparison card.
- Use real medical examples for testing layout.
- Design source viewer early; this is a trust differentiator.
- Design error/no-source states, not just perfect states.
