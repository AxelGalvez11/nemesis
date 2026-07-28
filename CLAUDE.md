# Nemesis — working agreement

## What this product is (standing rule, set by owner 2026-07-27)
- **Nemesis is a field-agnostic academic OS.** It serves students and learners in *any*
  discipline — law, engineering, history, nursing, computer science, art history, trades.
- **It is NOT a pharmacy, drug, medical, or health product.** Earlier names in this repo's
  history — "PharmaBro", "PharmaOrb" — are dead. Never describe the product that way, never
  reason about it that way, and never scope a feature to one field.
- Domain-specific data sources that still exist in the codebase (drug lookups, openFDA,
  literature search) are *features some students use*, not the product's identity. Leaving
  them in place is correct; treating them as what Nemesis *is* is not.
- **Design test for any feature: would this work for a law student and a mechanical
  engineering student?** If a rule, prompt, heuristic, or keyword list only makes sense for
  one field, it is wrong. Prefer structural signals (headings, emphasis, position, document
  shape) over subject-matter keyword lists, which never generalize.

## Communication (standing rule, set by owner 2026-06-08)
- **Explain all work in plain English.** Write for a non-engineer owner: say what changed,
  why it matters, and what it means in everyday terms.
- No "caveman"/compressed/abbreviated explanation styles. No jargon-first summaries.
- If a technical term is unavoidable, define it in one short phrase inline.
- This governs status updates, summaries, PR descriptions to the owner, and answers to questions.
  (Code, commit messages, and code comments stay normal/technical.)
