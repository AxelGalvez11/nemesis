# Silent Office image stripping — incident record

**Status: closed.** Fix merged as `f4fad06a` (PR #427) and verified against production
2026-08-05.

---

## The invariant this incident established

> **If Nemesis cannot ingest the complete source, it must say so. It may never silently discard
> source content and continue as though ingestion were complete.**

## What was wrong

Attaching a `.pptx` or `.docx` larger than the storage ceiling in chat caused the browser to delete
**every image in the file** before uploading. The stripped remains were uploaded, stored, parsed and
answered from.

A real 123.8 MB lecture went in as **0.11 MB**. Extraction succeeded. All 37 slides came back.
Nothing recorded that **57 figures had been removed** — so the stored source, the coverage report,
retrieval and the model all treated a half-read lecture as a complete one.

## Why no test caught it

Every layer behaved **correctly** on the stripped file. There was no crash, no error, no failed
assertion. The defect was in the *wiring*, not in any component's behaviour.

The code's own comment asserted safety: *"the coverage report the extractor already produces states
how many images were found so a partial read is never presented as complete."* That is the precise
error. **A coverage report computed from the derivative can only ever describe the derivative.** It
counted the zero images that survived, not the 57 that were deleted, and called that complete
coverage.

This is the reasoning behind the promotion gate in
[document-normalization.md](../document-normalization.md): completeness can never be self-certified
by the artifact being measured. It must be established by reconciling the derivative's inventory
against the archival original, and `dropped > 0` blocks promotion.

## The fix

An oversized Office file is now refused, with a sentence that says why. `slimOfficeArchive` and its
tests remain for future Tier 4 work — they are correct at what they do — but nothing calls them.

A static regression test asserts that `chat-attachments.ts` contains no call to the stripping path.
Static tests are usually the weak kind; here it is the strongest available, because what must be
prevented is the wiring itself. **Verified to discriminate:** against the pre-change file it fails
with `chat-attachments.ts calls slimOfficeArchive again` (5 pass / 1 fail), and passes only after
the change.

When Tier 4 disclosure exists, that test should be **replaced** by one asserting the disclosure is
written — not deleted, which would restore the silent version.

## Deployment — merged is not live

The merge commit's Vercel checks both read `failure`, pointing at
`?upgradeToPro=build-rate-limit`. Nothing had compiled and failed: the build was never allowed to
start, so **no deployment record existed at all**. Vercel does not retry these, so the fix would
have sat on `main` indefinitely until an unrelated commit triggered a build.

```
merged                                      2026-08-05T22:22:11Z
newest production deployment at that time   42 minutes old
```

Resolved by creating a production deployment from the git ref directly
(`POST /v13/deployments`, `sha f4fad06a`, `target: production`). Build succeeded in ~2 minutes.

🔴 **A green merge does not mean a shipped fix.** For anything time-sensitive, check the deployment,
not the merge.

## Production verification

Deployment `dpl_J527vhp2GrkWbfURdehgZxtmY1yK` — `READY`, `target: production`,
`sha f4fad06ae9e1034341d91949799ec87f7477ffc3`, branch `main`, aliased to `app.enternemesis.com`.

**1. Production is serving the fix.** Enumerated every script the live app loaded (33) and searched
the served bundles:

| probe | result |
|---|---|
| new refusal string present | ✅ found in `0fv7smwv8xt9z.js` |
| media-stripping regex present | ✅ **absent from every loaded chunk** |

**2 & 3. Oversized case now refuses.** A 60 MiB `.pptx` (over the 50 MiB ceiling production
enforces) attached and sent through the real composer. The model's reply:

> "The file didn't reach me. It's over the 50 MB limit, and I won't process a stripped-down version,
> because an answer built on half the lecture would be unreliable."

Network evidence — **the decisive check**: zero calls to `/storage/v1/object` and zero to
`/api/notebooks/extract/file`. Not one byte of that file left the browser. Under the old code it
would have been stripped and uploaded.

**4. Ordinary under-limit uploads still work.** A small valid `.pptx` (2.7 KiB, two slides,
distinct text on each) through the same path:

```
/storage/v1/object/library-sources/…    371 ms
/storage/v1/object/sign/library-sources/… 460 ms
/api/notebooks/extract/file            2364 ms
```

Both slides' text reached the model, which answered from each one separately. Not wrongly refused.

## Notes

- Verification ran against the owner's own signed-in session. It left **two test chats** in the
  account, titled *"production verification test - oversized attachment refusal"*. Safe to delete.
- The refusal text reaches the model's context rather than rendering as a UI banner, so a DOM search
  for the literal string returns nothing. The model paraphrases it. **Judge this behaviour by the
  network trace, not by the visible copy.**
