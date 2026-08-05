# Phase 1 accepted baseline

**Production SHA: `d10b312a`** — tagged `phase1-accepted` (`git show phase1-accepted`).
Accepted by the owner on 2026-08-05 after a twelve-check acceptance pass run against
the signed-in production app, with a `fetch` interceptor recording every model request
and every database query, plus direct SQL for each mutation.

What it contains:

| SHA | PR | What landed |
| --- | --- | --- |
| `7530783f` | #411 | Chat becomes the workspace control layer |
| `ff2dffc7` | #412 | No leaked tool markup; "what should I study" keeps its tools |
| `d10b312a` | #413 | The course number is part of the course name |

Anything after this tag is Phase 2. If a Phase 2 change makes production behave worse
than this baseline, `git diff phase1-accepted` is the honest starting point.

## The twelve accepted checks, and where each one lives now

The owner's instruction was to keep these as permanent regression tests. Most of each
check is now in CI. **Some of it cannot be**, and the split is stated here rather than
implied, because "12/12 green in CI" would be a claim the tests do not support: a unit
test can assert what a rule decides, never that production called the tool, used real
data, or actually wrote a row.

| # | Check | Pinned in CI | Still production-only |
| --- | --- | --- | --- |
| 1 | "Help me organize my schedule." | routing + tools attached | which calendar tools it chose |
| 2 | "What do I have today?" | routing; local-date resolution | the day's real events |
| 3 | "Show me everything this semester." | routing; window resolution; payload stays valid JSON | completeness against the database |
| 4 | "Check my calendar for duplicates or conflicting exam dates." | routing; all four finding categories | that it declined to auto-resolve |
| 5 | "Show me how my Library is organized." | routing; root notes are listable | the tree matching the database |
| 6 | "Clean up my Library." | routing; no markup under round exhaustion | 18 calls over 5 rounds, tools present each round |
| 7 | "Show me what I need to study." | routing — the exact phrase, plus eight more | real due counts |
| 8 | "Move this deck into Pharmacology." | routing | the deck arriving intact |
| 9 | Uploads file by course, ambiguous ones to Inbox | filing decision; extension→mime contract | the storage bucket accepting the mime |
| 10 | "Organize everything for Pharmacology…" | routing; the 8-round workspace budget | 23 calls across three surfaces, then a real move |
| 11 | Folder rename keeps its folder page | the whole rename plan, incl. nested contents and the untouched same-name root note | the row update itself |
| 12 | Folder deletion is held for confirmation | the gate's decision and its payload | the card rendering on screen |

Test files: `apps/web/lib/workspace/workspace-intent.test.ts` (1–8, 10),
`apps/web/lib/workspace/library-folder-plan.test.ts` (11), `apps/web/lib/workspace/chat-attachments.test.ts`
and `packages/shared/src/course-filing.test.ts` (9), `packages/shared/src/destructive-tools.test.ts` (12),
`apps/web/lib/workspace/chat-tool-rounds.test.ts` and `chat-tool-markup.test.ts` (6, 10),
`apps/web/lib/workspace/calendar-agent-range.test.ts` and `calendar-issues.test.ts` (2, 3, 4).

## The two bugs that produced this baseline

Both are pinned by tests that name them, because both were invisible from the chat
window — the answers read as plausible while the work behind them had not happened.

**Leaked tool markup.** The final tool round was sent with no tools attached and
nothing telling the model so, so it emitted its own invocation syntax into the text
channel and the student watched it paint in. Fixed three ways: the model is told, the
budget is larger for workspace turns, and a sanitizer withholds anything after an
unclosed marker while streaming.

**Cleaning up afterwards is its own hazard.** Check 11 renames a folder and renames
it back. It picked a folder the owner had made the day before, and the rename left
every row inside it carrying a fresh `updated_at` — which I then read as "the pass
made this" and said so. See [ACCEPTANCE-CLEANUP.md](./ACCEPTANCE-CLEANUP.md); the
rule is now code, and nothing gets deleted on a timestamp alone.

**The course number was invisible.** The tokenizer required every token to start with
a letter, so `PHCY 2114` reduced to `{phcy}` — and so did the other five PHCY courses.
Every comparison tied, and a tie is a refusal, so nothing numbered could ever leave
Inbox. Do not loosen the tie rule to raise the number of matches: refusing is correct,
and Inbox is where a student can find the thing.
