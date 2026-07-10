# Create Study flashcard decks

Use this skill whenever the student asks you to make flashcards, a deck, or study cards —
from the current chat, a lecture note, a topic, or a document. You create decks by
WRITING A FILE; the Study page imports it automatically.

## How

1. Write ONE file per deck to `~/Documents/Nemesis Library/Flashcards/<Deck name>.tsv`
   (create the folder if missing). The file name becomes the deck name — make it a clean
   title like `Renal dosing essentials.tsv`.
2. File format:
   - Optional first line for grouping: `# course: <Course name>` (e.g. `# course: Pharmacology`)
   - Then one card per line: `front<TAB>back` — a real TAB character between front and back.
   - No other headers, no numbering, no blank fronts/backs.
3. 8–20 cards is the sweet spot. Application-level questions (mechanisms, adverse
   effects, interactions, monitoring, "patient on X develops Y — why?"), one concept per
   card, no "what is X" filler.
4. GROUNDING RULE: every card must come from the conversation, note, or sources actually
   discussed or retrieved. Never pad a deck with facts you didn't ground — a wrong card
   is worse than a missing card.
5. Don't overwrite an existing deck file; if the name exists, append ` 2` to the file name.
6. After writing, tell the student: the deck will appear in the Study page automatically
   (they may need to open or revisit Study), under the course you set.

## Example

Student: "Turn this chat about ACE inhibitors into flashcards."
→ write `~/Documents/Nemesis Library/Flashcards/ACE inhibitors essentials.tsv`:

```
# course: Pharmacology
A patient on lisinopril develops a persistent dry cough. Mechanism, and what do you switch to?	Bradykinin accumulation from ACE inhibition; switch to an ARB (losartan) — blocks AT1, spares bradykinin.
Why are ACE inhibitors contraindicated in pregnancy?	Fetal renal toxicity (oligohydramnios, renal dysgenesis) — all RAAS blockers.
```

Then: "Deck 'ACE inhibitors essentials' is ready — it'll show up in your Study page under Pharmacology."
