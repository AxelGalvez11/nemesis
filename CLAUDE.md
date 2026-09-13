# Nemesis — working agreement

## What this product is (standing rule, updated by owner direction 2026-09-12)
- **Nemesis is the AI lecture memory for students.** The default loop is: record/import class → transcript → structured notes → grounded search/Q&A → flashcard drafts → approve/edit → Nemesis review or Anki sync.
- **Lecture capture is the acquisition wedge. Persistent course memory and learning are the product.** Do not stop a feature design at "we made a transcript." Ask how the captured material becomes findable, trustworthy and memorable later.
- **Nemesis remains field-agnostic.** It serves students and learners in any discipline — law, engineering, history, nursing, computer science, pharmacy, art history, trades. A rule that only makes sense in one field is the wrong abstraction.
- **It is NOT a pharmacy, drug, medical, or health product.** Earlier names in this repo's history — "PharmaBro", "PharmaOrb" — are dead. Domain-specific data sources that remain are optional capabilities, not the product identity.
- **Canvas is a deep-study surface, not the headline product.** The product must make sense through the simple path Classes → Lecture → Transcript/Notes → Cards → Review even if a learner never opens Canvas.
- **Slides, PDFs, readings, syllabi and pasted notes are context for lecture memory.** Preserve the document-intelligence systems; use them to improve structure, spelling, grounding and retrieval around captured classes.
- **Anki is a first-class interoperability target.** Nemesis owns generation, source provenance and approval. Anki may own spaced-repetition review for users who prefer it. Do not design card storage so tightly around Nemesis review state that export/sync becomes lossy.
- **AI-generated cards are drafts until approved.** Never silently flood a learner's review queue with generated cards.
- **Normal academic transcription should feel unlimited, but infrastructure must remain economically bounded.** Prefer monthly fair-use, abuse prevention, priority tiers and provider routing over rigid daily recording caps. Never hard-code a speech vendor into product-facing contracts.
- **Design test for any feature:** does this help a student capture a real class, recover what mattered, or remember it? Would the same abstraction work for a law student and a mechanical-engineering student?

Read `docs/product-north-star.md` before making product-scope decisions and `docs/anki-sync.md` before changing card identity, export or sync behavior.

## Source integrity
- Preserve provenance from generated notes, answers and cards back to transcript timestamps or document anchors.
- Refusing beats guessing. A missing card is cheaper than a fabricated card that is later memorized.
- Structure computed upstream must survive every boundary.
- Degraded pipelines must identify themselves as degraded rather than silently appearing complete.

## Communication (standing rule, set by owner 2026-06-08)
- **Explain all work in plain English.** Write for a non-engineer owner: say what changed, why it matters, and what it means in everyday terms.
- No "caveman"/compressed/abbreviated explanation styles. No jargon-first summaries.
- If a technical term is unavoidable, define it in one short phrase inline.
- This governs status updates, summaries, PR descriptions to the owner, and answers to questions.
  (Code, commit messages, and code comments stay normal/technical.)

## Design system (standing rule, set by owner 2026-09-11)
- **Every visual change follows `/design`.** Start at `/design/README.md` (the owner's rulings, newest first), then the surface's family in `/design/SURFACES.md` and its row in `/design/COVERAGE.md`. The `nemesis-design` skill walks through it.
- The marketing site, sign-in and pricing follow Sana, measured one for one; the app follows `/design/DESIGN.md`.
- Guards in `apps/web/lib/design/` fail when a component family has no coverage row, or when arbitrary sizes, radii or spacing grow.
