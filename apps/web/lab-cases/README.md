# Nemesis Lab cases

Saved failures. Each folder is one case: the file (for a parser case) or the frozen turn
(for a teaching case), what was wrong with it in the owner's own words, and what Nemesis did
at the time.

**These are baselines, not expectations.** A case is saved *because* the behaviour was wrong,
so a rerun reports what CHANGED since it was saved and never says "pass". A rerun that matched
the old behaviour exactly is the bad news, not the good news.

Run every parser case from `apps/web`:

    ../../node_modules/.bin/tsx scripts/lab-replay.ts

Add `--strict` to exit non-zero when anything drifted, which is what a merge gate wants.

Teaching cases rerun in the browser, on `/dev/lab/replays`, because a teaching turn needs a real
learner session to reach the model and to write evidence under row-level security. The command
line lists them as SKIPPED rather than counting them as unchanged.
