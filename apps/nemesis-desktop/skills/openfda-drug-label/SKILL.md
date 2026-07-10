---
name: openfda-drug-label
description: "Look up official FDA drug labeling (indications, dosing, warnings, contraindications, adverse reactions, boxed warnings, drug interactions) from openFDA — the authoritative source for what a drug's label actually says. Use for any question about approved use, dosing, or safety of a specific medication."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [openfda, fda, drug, label, dosing, indications, warnings, contraindications, adverse-effects, boxed-warning, interactions, medication, pharmacy]
    related_skills: [pubmed-evidence]
---

# openFDA Drug Label

Answer "what does the label say" questions from the **official FDA labeling**, not memory.
For a pharmacy/health-sciences student this is the source of truth for approved indications,
dosing, contraindications, warnings, and boxed (black-box) warnings. You have the `web` tool —
openFDA is a plain HTTPS GET JSON API, no key needed for light use.

## When to use
Any question about a specific drug's **approved use, dose, safety, warnings, contraindications,
interactions, or adverse reactions** ("What's the boxed warning on X?", "renal dosing of Y?",
"contraindications for Z?"). For evidence from studies/comparisons use [[pubmed-evidence]] instead
(or alongside — label for "what's approved", PubMed for "what does the research show").

## The call
Base: `https://api.fda.gov/drug/label.json`
```
GET https://api.fda.gov/drug/label.json?search=openfda.generic_name:"<drug>"&limit=1
```
- Search by `openfda.generic_name:"lisinopril"` (generic) or `openfda.brand_name:"Prinivil"` (brand). Quote multi-word names.
- The response `results[0]` is the label. Useful fields (each an array of text blocks):
  `indications_and_usage`, `dosage_and_administration`, `contraindications`, `warnings` /
  `warnings_and_cautions`, `boxed_warning`, `adverse_reactions`, `drug_interactions`,
  `use_in_specific_populations` (pregnancy/renal/hepatic/pediatric/geriatric), `mechanism_of_action`,
  `how_supplied`. Read only the fields the question needs — these blocks are long.
- Narrow further with `+AND+`: e.g. `search=openfda.generic_name:"metformin"+AND+_exists_:boxed_warning`.

## Rules (same trust posture as the whole product)
- **Quote/paraphrase only what the label returned.** Never invent a warning, dose, or contraindication. If a field is absent, say "the label doesn't list a boxed warning" rather than guessing.
- **Cite the source.** End with: "Source: FDA label via openFDA (generic: <name>)". Include the openFDA disclaimer spirit — this is labeling data, not personalized medical advice.
- **Safety.** For actual dosing decisions, self-harm/overdose, pregnancy, pediatric: add "Verify against the current official label and your instructor/pharmacist — study support, not medical advice."
- If the drug isn't found, loosen: try the other of generic/brand, check spelling, or fall back to [[pubmed-evidence]].
- openFDA rate-limits unauthenticated (~40 req/min, 1000/day) — one or two calls per question is plenty.

## Example
> "What's the boxed warning for metformin, and when is it contraindicated?"
1. `GET …/drug/label.json?search=openfda.generic_name:"metformin"&limit=1`
2. Read `boxed_warning` (lactic acidosis) + `contraindications` (severe renal impairment eGFR <30, acute/unstable HF, metabolic acidosis).
3. Answer in plain language, quote the boxed-warning phrasing, cite "FDA label via openFDA (metformin)", add the verify-with-instructor line.
