# Canvas v1 — owner review

**Produced 2026-08-13. Serving commit `f12dabc7`.**

This answers one question: **is Canvas v1 ready for the owner to look at?**

**Short answer: go and use it. Then read the two sections that say what is not proven and what is missing, because those are the parts you cannot see by using it.**

---

## 🔴 The four words that are not synonyms

```
implemented   the code exists
merged        it is on main
deployed      a build of it exists and serves
PROVEN        someone exercised it on the deployment holding the production alias
```

**Only the fourth counts, and this document keeps `PROVEN` and `BLOCKED` strictly apart.** They get conflated constantly, and conflating them is how *"the tests pass"* comes to stand in for *"the feature works."*

🔴 **Six criteria are BLOCKED, not untried.** Nobody on the team can sign in — the sign-in page carries a bot challenge, entering the owner's password is prohibited, and minting a session with an admin key is an owner security decision that was never granted. **Two lanes independently proved this is the only route:** a script route was attempted and hits the identical refusal, in zero milliseconds, before it reaches the network.

---

## 1. What you can do now

Everything here is **merged and serving**. Where it is proven, it says so.

| | Proven? |
|---|---|
| **Type a topic and be asked something.** No upload. Nemesis maps the subject and opens with a real question. | 🟢 **PROVEN** on your own canvas |
| **Upload a document and be taught from it** — read, questioned, judged by meaning rather than wording, and what you demonstrated is remembered across canvases | 🟢 **PROVEN** |
| **Be corrected and then asked again.** One wrong answer used to seal a fact permanently | 🟢 **PROVEN** |
| **Get something right without the loop stopping.** Your words turn green and the next thing appears; no button | 🟢 **PROVEN** |
| **Upload your own notes** (`.md`, `.txt`) and spreadsheets | 🔴 merged and serving, **upload hop unproven** |
| **Record a lecture from the Canvas** and have it land as a source on that canvas | 🔴 merged and serving, **capture unproven** |
| **Manage your canvases** — folders, rename, move, delete, search | 🔴 merged and serving, unproven |
| **Arrive where you clicked**, including from the extension's import link while signed out | 🔴 merged and serving, unproven |
| **See where material came from** — a quiet `[1]`, and *"Generated from model knowledge"* when there is no source | 🔴 merged and serving, unproven |

### Things that stopped happening

- The **fixed quiz** — counter, six questions, revealed answer, explanation of what you just demonstrated — is **gone**, and the machine that drew it is deleted. 🟢 **PROVEN** on a canvas it had captured.
- **Renaming a canvas no longer re-teaches it.** The title *was* the topic, so tidying your shelf silently changed the subject.
- **A topic no longer rebuilds its map on every open.** One canvas opened twice held ~99 objectives instead of ~50, unbounded, a paid model call each time. 🔴 Fixed, merged, serving, **unproven**.
- **The same document attached twice** no longer tells you Nemesis understood less of your material than it did.

---

## 2. What is still broken

**Live, in the product, today.**

| | |
|---|---|
| 🔴 **Recording has a data-loss window** | Between pressing stop and the source appearing there is **one copy of your lecture, in the browser tab.** The audio is deleted when transcription starts; the transcript is handed over exactly once. Closing the tab loses the lecture — not just the transcript. **The interface says so plainly and promises nothing.** A cheaper close than the durable rebuild is being characterized. |
| 🔴 **~180 orphaned audio objects per lecture** | On a normal finish the durable upload chunks are never deleted. Storage you pay for, accumulating per lecture. |
| **Six documents invisible to search** | They were stored without structure, and the only fix is re-reading them — which the frozen parser version makes impossible. **This and the frozen version are one problem, not two.** |
| **A re-poll of a finished transcription** | Reports *"did not hear anything"* — honest-sounding and wrong. Not reachable from the current interface. |
| **Click-to-reopen a collapsed block** | Fails the rule that the learner does not manage AI-generated blocks. **Currently unreachable** — no block in production is collapsed. *Unreachable is not compliant; it is undetonated.* |

---

## 3. Proven versus blocked

**Integration is the acceptance authority and owns the count. The figures below are theirs, as of their last full pass, and the doc holds 61 numbered criteria.**

```
🟢 PROVEN            ~33   observed on the deployment holding the alias
🔴 FAILED              2   click-to-reopen · the front-door product gap (since fixed, unproven)
⚪ NOT EXERCISABLE   ~19   the capability does not exist yet — NOT failures
⬜ BLOCKED / UNTRIED  ~9   six of these are blocked on the sign-in
```

🔴 **The largest category is not broken. It is unbuilt.** Nineteen criteria describe the Minimap, causal knowledge, and Canvas rewriting — none built, and proving them would mean building features rather than verifying them.

**Blocked on the sign-in, specifically:** whether pressing the composer `✓` writes no evidence · whether it appears in reading and is absent when an answer is required · whether the Sources disclosure renders · whether a spreadsheet uploads end to end · whether the topic map genuinely builds once and refuses twice · whether a recording captures.

---

## 4. The ten items you asked for

| | | |
|---|---|---|
| 1 | Front door — a topic produces a question | 🟢 done, **proven** |
| 2 | Library as the canvas manager | 🔴 done, merged, unproven |
| 3 | Sign-in lands on the front door | 🔴 done, merged, unproven |
| 4 | Recording startable from the Canvas | 🔴 done, merged, **capture unproven**, loss window open |
| 5 | Spreadsheets attachable | 🔴 done, merged, upload hop unproven |
| 6 | The unindexed documents explained | 🟢 done — it is the frozen parser version |
| 7 | Gradeable acceptance criteria | 🔴 blocked on the sign-in |
| 8 | App shell and sidebar | 🔴 done, merged, unproven |
| 9 | Composer progression `✓` | 🔴 done, merged, unproven |
| 10 | Question-driven Canvas rewriting | ⏸ **explicitly requested, consciously deferred** |

### 🔴 Item 10 — deferred, not dropped

**You asked for this in detail and I once described it to you as unrequested. That was wrong and it is corrected here.**

**The substrate exists more than expected.** All four rewrite radii have validated, gated operations; the concept-to-block selector exists and is populated; the scope is enforced as a refusal rather than advice — in the arm the front door no longer runs.

**Remaining:** a trigger routing a composer question into that path · a concept **set** feeding the selector, with Brain deciding membership · **block-level retirement, which does not exist** — no tombstone, no supersession · **durable region identity, absent**, so a repair cannot outlive the canvas that made it.

**Resolved and no longer dependencies:** blocks are created by the **first question**, not at canvas creation, because a question is the cognitive reason exposition requires · blocks are **durable** and their **visibility** is a resolution decision · concept identity is canvas-local for v1, so a rewrite radius does not cross canvases.

---

## 5. What only you can unblock

| | |
|---|---|
| 🔴 **Sign in at `app.enternemesis.com` in Chrome** | Unblocks six criteria. **Proven to be the only route.** No password or key passes through the team. |
| **A Gemini key** | The vision comparison — designed, sampled, costed at **~$0.65**, 20 documents from where the parser scores worst. |
| **The backfill** | Re-reading every stored document would fix six unsearchable ones and improve six more with no structure. 🔴 **Destructive:** a learner opening their canvas mid-backfill sees their material and is asked nothing. |
| **Recording durability** | Whether to close the loss window now or accept it with the warning. |
| **Whether to fix block segmentation** | See below. |

---

## 6. Known gaps, recorded rather than worked

- **Minimap** — not built.
- **Causal cognition beyond the existing substrate** — not built.
- 🔴 **The parser's largest deficit is segmentation, not labelling.** Measured over 10,331 elements: **72% is a block more than five times the size of the thing it covers**, 11.6% is a wrong name, 13% is not covered. **The typical element it "misses" is entirely inside one of its own blocks** — 5,616 are at least 99% contained and score zero. *An earlier claim that this was "a classifier over geometry" is retracted; it is wrong for about 88% of the gap.*
- **The parser is not top tier**, measured against a public suite we did not design. Behind on all five dimensions — **and not a like-for-like comparison:** every parser above us reads a *photograph* with a vision model at up to **$1.25 per page** against our **$0.00**.
- **Running headers score zero and cannot be improved on that suite** — every document in it is a single page, and running furniture is recognised by repetition *across* pages.

---

## 7. How to read anything this team tells you

Six habits earned tonight, each from a failure:

1. **A green check is not a deployment.** The alias moved nine times; one commit built green and never served.
2. **Build the positive control first.** An absence proves nothing unless the same instrument can show the presence. This caught two false passes that were otherwise about to be reported as successes.
3. **A test that cannot fail before the fix cannot witness the fix.**
4. **An absence needs the boundary of where you looked.** A zero, an unreached line and a scope-limited verdict are all silences.
5. **A count is a count of something** — check that set is the same as the thing being decided.
6. **Verify containment by content, not by the word "merged".** A squash merge left a correction behind and a false claim was live for twenty minutes.

---

## Related

- [`canvas-v1-acceptance.md`](./canvas-v1-acceptance.md) — the criteria and their traps
- [`canvas-interaction-model.md`](./canvas-interaction-model.md) — how cognitive state reaches a learner
- [`canvas-cognitive-runtime.md`](./canvas-cognitive-runtime.md) — what Canvas must know and decide
- GitHub issue #505 — the team's working record
