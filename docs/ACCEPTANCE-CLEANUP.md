# Cleaning up after a run on real data

An acceptance pass runs against the owner's own production workspace. It creates
things — probe events, probe notes, probe folders — and afterwards it has to take
them back out. This is the rule for that, and the rule exists because it was got
wrong once, in the worst way.

## What happened on 2026-08-05

After the Phase 2 acceptance pass I told the owner that a folder in their Library
named `test` was mine, and offered to remove it.

It was not mine. It was created on **2026-08-04 at 20:58 UTC**, a full day before
my pass started. And while the pass was running the owner went on using the app —
they recorded a session about GR Corolla trims, which dropped a real
3,574-character note, its folder page and its source file inside that same folder
at 17:56–17:57.

What fooled me was `updated_at`. Check 11 of the pass renames a folder and
renames it back, and it had picked `test`. Every row underneath carried a
timestamp from minutes earlier, so the whole subtree looked freshly made.

The owner then said "remove the test folder" — on the strength of my claim. The
delete was only avoided because I looked at the rows before running it.

The five rows are worth studying, because they fail in **two different ways**
(real ids and timestamps, still in the database, pinned in the test file):

| Row | Created | Why it is not the run's |
| --- | --- | --- |
| folder `test` | 2026-08-04 20:58:03 | predates the run — **time** refuses it |
| `test/test.md` | 2026-08-04 20:58:04 | predates the run — **time** refuses it |
| GR Corolla note | 2026-08-05 **17:56:05** | inside the run window — only **identity** refuses it |
| `test/Lectures/Lectures.md` | 2026-08-05 **17:56:26** | inside the run window — only **identity** refuses it |
| GR Corolla source file | 2026-08-05 **17:57:13** | inside the run window — only **identity** refuses it |

So "delete anything newer than my start time" would have destroyed the owner's
recording. Time narrows the field; only identity picks out of it. Both halves of
the rule below are load-bearing, and each is doing the work on some real row here.

## The rule

> A test may delete or trash a row only when the **database** says the row was
> created after the run started **and** the run can **name** it. Creation time
> comes from the row; identity comes from the run's manifest. Both are required
> and neither substitutes for the other.

`updated_at` is not consulted at all. Recency is not authorship.

Implemented in [`packages/shared/src/acceptance-cleanup.ts`](../packages/shared/src/acceptance-cleanup.ts),
pinned by `acceptance-cleanup.test.ts`. The entry point is:

```ts
const plan = planAcceptanceCleanup(manifest, rows);
assertCleanupSafe(plan);   // throws if the run's records contradict the database
for (const row of plan.remove) { /* only these */ }
```

### What follows from it

| Bucket | Meaning |
| --- | --- |
| `remove` | Born after the run started, and the run names it. Safe to delete or trash. |
| `blocked` | The run made this container, but something pre-existing sits inside it. **A folder delete takes its children with it**, so the container stays. |
| `restore` | The run changed this but did not make it. Put it back; never delete it. |
| `keep` | Not the run's. Untouched. |
| `unsafe` | The manifest claims it; the database says it is older. **Stops the whole cleanup.** |
| `unaccounted` | Claimed by the run, not present in the rows supplied. Nothing to do. |

Four design choices worth stating, because each one is a way the rule could be
quietly weakened later:

1. **Deny by default.** A row with no readable `created_at` is kept. Missing
   evidence is not permission.
2. **The manifest cannot self-certify a timestamp.** A run records ids, never
   creation times — otherwise it would just be repeating its own guess.
3. **`unsafe` throws, it does not warn.** A run wrong about one row has no
   standing to be believed about the others. A bucket that is only printed is a
   note, not a guardrail.
4. **A marker must carry the run id.** `nemesis-run:<runId>`, not a bare fixture
   name — "probe" would happily match a student's own note called "probe".

### The one thing the module cannot check for itself

🔴 **It only sees the rows you hand it.** A folder whose children were not loaded
looks childless, and a childless folder looks safe. Load the full subtree before
asking about a container.

## Where it is enforced, and where it is not

Same split as [`PHASE1-BASELINE.md`](./PHASE1-BASELINE.md): stating what CI
actually proves, rather than letting "tests green" stand in for it.

| Surface | Status |
| --- | --- |
| The rule itself — all six buckets, the subtree block, the `unsafe` throw | **In CI.** `deno test packages/shared/src/` on every PR. |
| `scripts/guardrail-suite.ts` teardown (deletes a live auth user) | Wired through the gate and type-checked in CI. **The wiring itself is not exercised by PR checks** — the guardrail suite has been manual-dispatch-only since #407, so it runs only when someone dispatches it. |
| An agent cleaning up by hand after a production pass | **Not enforceable in code.** Build a manifest as you go, run the plan, paste the report. The module is the checklist; using it is a discipline. |

## Building a manifest

Record ids **as you create them**, not afterwards from a query — "what changed
recently" is the exact reasoning this document exists to forbid.

```ts
const manifest: RunManifest = {
  runId: "phase3-a1b2c3",
  startedAt: new Date().toISOString(),   // BEFORE creating anything
  created: [],                           // push { id, kind, label } at each create
  touched: [],                           // push anything you rename, move, or edit
};
```

Where the table has a free-text field, put `runMarker(runId)` in it too. It
covers the case where the run dies between making a row and writing the id down —
the row still says whose it is.
