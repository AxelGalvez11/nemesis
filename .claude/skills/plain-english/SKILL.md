---
name: plain-english
description: Write copy that does not read as machine-written, in language a non-expert can follow. Use before writing or editing ANY text a person will read - landing page and marketing copy, product and UI strings, onboarding, emails, docs, README files, release notes, PR descriptions, status updates to the owner. Also use when asked to "make this sound human", "simplify this", "less jargon", "it sounds like AI", or when rewriting text that already reads as generated.
---

# Plain English

Two jobs, one pass: **do not sound like a machine**, and **do not make a reader work harder than the idea requires.**

Not for: code, code comments, commit messages, or technical design docs written for engineers. Those stay technical.

## The two-pass method

Write the draft for meaning. Then run these two passes over it, in order. Most of the value is in pass one.

---

## Pass one — strip the machine tells

These come from Wikipedia's editors, who spend all day spotting generated text. Full lists in `references/ai-tells.md`. The high-frequency ones:

### Kill the vocabulary cluster

One of these is a coincidence. Three in a paragraph is a signature.

> additionally · align with · boasts · bolstered · crucial · delve · emphasizing ·
> enduring · enhance · fostering · garner · highlighting · intricate · interplay ·
> key · landscape · meticulous · pivotal · robust · seamless · showcasing ·
> tapestry · testament · underscore · valuable · vibrant

### Use "is"

Generated text avoids plain copulas. Real writing does not.

| Instead of | Write |
| --- | --- |
| serves as / stands as / functions as / represents | **is** |
| boasts / features / maintains / offers | **has** |
| Nemesis serves as a study companion | Nemesis is a study companion |

### Cut the significance inflation

Any sentence explaining why the thing you just described matters, in the abstract, is filler. Delete it whole — do not rewrite it.

Tells: *stands as a testament · marks a pivotal moment · underscores its importance · reflects a broader shift · plays a crucial role · setting the stage for · leaves an indelible mark · in an evolving landscape.*

### Cut the trailing participle

The clause hanging off the end of a sentence that adds an unearned conclusion.

- ❌ "…which builds a study plan from your syllabus, **ensuring students stay on track and fostering deeper engagement.**"
- ✅ "…which builds a study plan from your syllabus."

Tells: *ensuring · highlighting · underscoring · reflecting · fostering · cultivating · enhancing · contributing to · thereby.*

### Ration the negative parallelism

"Not just X, but Y." "It's not X, it's Y." "X rather than Y." One per page is a rhetorical choice. Three is a tic.

- ❌ "Not a chatbot, but a tutor."
- ✅ "It asks you to explain it back."

### Do not write the challenges-and-future paragraph

"Despite its strengths, X faces several challenges… Looking ahead, future developments could…" Nobody asked. Cut it.

### Say who said it

*Experts argue · industry reports suggest · observers have noted · studies show · it is widely considered.* Either name the source or drop the claim.

### The rule of three is a tic

Three-item lists everywhere — three adjectives, three benefits, three clauses. Vary the count. Sometimes two. Sometimes five.

### Formatting tells

- **Em dashes** — more than one or two per page reads as generated. Use a full stop or a comma.
- **Bold** used for emphasis inside running prose. Bold labels a thing; it does not shout.
- **Title Case On Every Heading.** Use sentence case.
- Bulleted lists where a sentence would do. If the items are not genuinely parallel, it is a paragraph.
- Curly quotes and apostrophes pasted straight out of a model.
- Emoji as section markers.

---

## Pass two — simplify the technical English

From Wikipedia's guidance on making technical articles understandable.

### Write one level down

Find the level where the topic is normally studied, then write for the level below it. A postgraduate topic gets undergraduate language. An undergraduate topic gets secondary-school language.

### Define before you use

Expand every acronym on first use. Never define A in terms of B and B in terms of A. Check that a term is explained before it appears, not after.

### Prefer the everyday word

Swap the technical term whenever the plain one means the same thing.

| Instead of | Write |
| --- | --- |
| vehicular emissions | emissions from vehicles |
| utilise | use |
| leverage | use |
| facilitate | help |
| prior to | before |
| in order to | to |
| a number of | some, or the actual number |

### Aim for about 12 words a sentence

Average, not maximum. Vary the length or the rhythm goes flat. A long sentence is fine when the idea genuinely has parts; a run of them is not.

### Front-load the easy part

Put the accessible material first. Later sections can get more technical. Someone who wants only the basics should find them without scrolling.

### Ground it in something concrete

An abstract claim followed by one real example beats three abstract claims. Analogies work, but only close ones — a far-fetched comparison costs more than it explains.

### Simplify, but do not lie

If a simplification is not strictly true, mark it — "roughly", "with some exceptions" — and follow with the accurate version. An oversimplification that leaves the reader confidently wrong is worse than the jargon.

---

## The self-edit checklist

Before you hand anything over:

1. Read it aloud. Anywhere you would not say it that way, rewrite it.
2. Search the draft for the vocabulary cluster. Delete or replace every hit.
3. Count em dashes. More than two on a page, cut them.
4. Find every sentence that says why something matters without adding a fact. Delete those sentences.
5. Find every trailing "-ing" clause. Delete or promote to its own sentence.
6. Check the first line. Does it say what the thing IS, in words the reader already knows?
7. Cut the last paragraph. It is usually a summary nobody needs.

## Worked example

**Generated:**

> Nemesis stands as a comprehensive learning platform that leverages cutting-edge AI to deliver a seamless, personalised educational experience. By meticulously analysing your course materials, it crafts an intricate curriculum tailored to your unique needs — fostering deeper engagement and underscoring its commitment to academic excellence.

Tells: *stands as, leverages, seamless, meticulously, intricate, fostering, underscoring, commitment to*; two em dashes; three trailing participles; says nothing.

**Rewritten:**

> Nemesis is a study app. Give it your lectures, slides and notes, and it builds a course from them — then teaches it to you and checks whether you actually learned it.

44 words to 34, and the second one tells you what it does.
