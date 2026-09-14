# How a Nemesis lesson is written

This is the standard every course lesson is held to. It was set by writing the seven lessons of
Anatomy and Physiology chapter 1 by hand and then measuring them.

You will be given a brief. It contains the section title, its learning objectives, the figures
available with their URLs, and the real textbook text. Write the lesson from that text and nothing
else. If the source does not cover an objective, teach what the source does say about it. Do not
supply the rest from memory.

## Output

One JSON file. No prose around it. This exact shape:

```json
{
  "course_id": "<copy from the brief>",
  "section_ordinal": 0,
  "minutes": 8,
  "written_by": "claude-opus-5",
  "blocks": [
    { "kind": "heading", "text": "A sentence that states the idea" },
    { "kind": "text", "text": "A paragraph. A word you are defining is marked [[like this]]." },
    { "kind": "figure", "fig": "f1", "caption": "What to look at in this picture." },
    { "kind": "check", "objective": 0, "question": "...", "choices": ["...","...","...","..."], "answer": 2, "why": "..." }
  ],
  "terms": [{ "term": "word", "definition": "One sentence, plain language." }],
  "figures": { "f1": { "url": "<copy from the brief>", "alt": "<copy from the brief>", "credit": "<course title>, CC BY 4.0" } },
  "flashcards": [{ "front": "...", "back": "...", "objective": 0 }],
  "items": [{ "objective": 0, "question": "...", "choices": ["...","..."], "answer": 1, "why": "..." }]
}
```

## The rules, all of them checked after you write

1. **Every `[[marker]]` has an entry in `terms`, spelled identically, and every entry in `terms` is
   marked somewhere in the passage.** Both directions. A definition a learner cannot click is
   wasted, and a marker with no definition renders as a dead dotted underline. Mark a word once, at
   the place you define it, not every time it appears. Only define words you actually introduce: if
   you find yourself with twenty terms, you are writing a glossary rather than teaching.
2. **Every `fig` key appears in `figures`, and every entry in `figures` is shown by a block.** Copy
   the URL and the alt text from the brief exactly. Never invent a key or a URL.
3. **`answer` is the index of the correct choice, counting from 0**, and it must be inside
   `choices`. Vary which position it lands in.
4. **`objective` is the index from the brief.** Every objective needs at least one `check`, at least
   one `item`, and at least one `flashcard`.
5. **At least 10 items and 7 flashcards.** Twelve and ten is a better target. The test draws six
   questions per paper and a learner can retake it, so a shallow bank repeats immediately.
6. **350 to 700 words of heading and text**, and aim for 400 to 650. The seven hand-written
   lessons run 383 to 644. Note that the standard and the checker have to agree on this number:
   the standard said 650 while the checker only failed above 700, so a draft could satisfy the
   check and still break the rule it was written to enforce.
7. **No em dashes or en dashes anywhere.** Use a full stop or a comma. This is an owner rule.

## The voice

**Plain, simple, technical English. No mannered prose.** Owner ruling, 2026-09-04. This is the
rule the others serve, so it goes first.

Mannered prose is writing that draws attention to itself. It is not the same as jargon, and a
lesson can be free of every banned word below and still be exhausting to read. The tells:

- **Aphorisms and turns.** "Atoms never touch, they only lean." Say what happens.
- **Withheld reveals.** "But there is a catch." "Here is where it gets interesting." A student
  reading to learn is not being told a story.
- **Sentence fragments for rhythm.** "Not quite. Not yet." Every sentence gets a subject and a verb.
- **Negative parallelism as a tic.** "Not X, but Y" once in a lesson is a choice. Three times is a
  mannerism.
- **Rhetorical questions.** "So what holds them together?" Just say what holds them together.
- **Straining for an image.** An analogy is worth it when it is closer than the plain description.
  "Like next-door neighbours whose kids hang out at each other's houses" is longer than "the
  electrons move back and forth" and teaches less.

The test: read the sentence aloud. If you would not say it that way to someone across a table,
rewrite it.

**A heading is a sentence that states the idea, not a label.** "Anatomy is the study of structure",
never "Anatomy". Someone reading only the headings should learn the section.

**Write one level below where the subject is normally taught.** A first-year university topic gets
sixth-form language. Define a term before you use it. Average about 12 words a sentence and vary
the length.

**Ban list.** delve, crucial, pivotal, robust, landscape, tapestry, testament, underscore,
seamless, intricate, meticulous, foster, garner, showcase, "it is important to note",
"plays a key role in". Never open a sentence with "Additionally" or "Furthermore".

**Say what a thing is, plainly.** "Physiology is the study of function", not "Physiology serves as
the study of function". Prefer "is" and "has".

**Ground it.** One concrete example beats three abstract claims. Salt in a cupboard, a raindrop
merging, oil beading on water. Take the examples from the source where it has them.

**A check is a real question, not a recall prompt.** Wrong choices should be things a learner might
actually believe, not obviously silly. The `why` explains what makes the right answer right AND
what the tempting wrong answer got wrong.

**A flashcard front is a question or a prompt. The back is the answer alone**, one or two
sentences, no preamble.

## Where the file goes

Write it to the path you are given. Do not commit anything. Do not touch any other file.
