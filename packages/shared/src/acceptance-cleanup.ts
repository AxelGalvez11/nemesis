/**
 * The gate in front of every delete an acceptance run performs on real data.
 *
 * On 2026-08-05 an acceptance pass ran against the owner's own production
 * workspace, and afterwards I told them a folder named `test` was mine and
 * offered to remove it. It was not mine. It had been created the previous day
 * at 20:58 UTC, and while the pass was running the owner recorded a session
 * about GR Corolla trims, which dropped a 3,574-character note, its folder page
 * and its source file inside that same folder. What fooled me was `updated_at`:
 * check 11 had renamed the folder to `Scratch` and back, so every row inside it
 * carried a timestamp from minutes earlier and the subtree *looked* freshly made.
 *
 * **Recency is not authorship.** A test that renames, moves, or edits a row
 * makes that row look new while changing nothing about who made it. So this
 * module refuses to reason from "when was this last touched" at all, and asks
 * instead for positive proof that THIS run brought the row into existence.
 *
 * Nor is creation time, on its own, enough. The owner kept using the app while
 * the pass ran, so three of their rows were genuinely born inside the run's own
 * window. "Anything newer than my start time is mine" would have deleted their
 * recording. Time narrows the field; only identity picks out of it.
 *
 * The rule, in one sentence: a row may be deleted or trashed only when the
 * database says it was created after the run started AND the run can name it —
 * creation time from the row, identity from the manifest, both required, no
 * substitutes. Everything else survives, including anything the run mangled.
 *
 * Three properties fall out of that, and each has a test:
 *
 *  - **Deny by default.** A row with no `created_at`, an unparseable one, or
 *    one the run cannot name is kept. Missing evidence is not permission.
 *  - **The manifest cannot self-certify.** A run records ids, never timestamps.
 *    If the run were trusted about creation time it would just be repeating the
 *    same guess that failed, with more ceremony.
 *  - **Containers inherit their contents' verdict.** `delete_library_folder`
 *    soft-deletes the folder *and everything beneath it*, so a folder the run
 *    really did create still cannot go if one pre-existing note sits inside —
 *    which is very close to what actually happened. That folder comes back
 *    `blocked`, and the note inside it comes back `keep`.
 *
 * Scope: this is for TEST AND ACCEPTANCE CLEANUP ONLY. The student's own
 * deletes go through `destructive-tools.ts`, which is a different question —
 * that gate asks "has a human approved this?", this one asks "is this ours to
 * remove?". Neither replaces the other, and the Phase 1 confirmation path is
 * frozen; nothing here touches it.
 */

/** The exact token a run writes into anything it creates, so the row says whose it is. */
export function runMarker(runId: string): string {
  return `nemesis-run:${runId}`;
}

/**
 * Does this row's marker name this run?
 *
 * `contains`, not `equals`, so a run can carry the token inside a title it also
 * wants to be readable — `"Phase 2 Probe Exam [nemesis-run:a1b2c3]"` marks
 * itself with no schema change and no separate bookkeeping to fall out of sync.
 * The runId is part of the token on purpose: a bare fixture name like "probe"
 * would happily match a student's own note called "probe".
 */
export function markerNamesRun(marker: string | null | undefined, runId: string): boolean {
  if (typeof marker !== "string" || !runId) return false;
  return marker.includes(runMarker(runId));
}

/** Something the run recorded AT THE MOMENT IT MADE IT. Ids only — see the header. */
export interface CreatedArtifact {
  id: string;
  kind: string;
  label: string;
}

/** Something the run changed but did not make. Never removable, whatever it looks like now. */
export interface TouchedArtifact {
  id: string;
  kind: string;
  label: string;
  /** What it looked like before the run, so the report can say what to put back. */
  before?: Record<string, unknown>;
}

export interface RunManifest {
  /** Unique to one run. Also the token `runMarker()` stamps into created rows. */
  runId: string;
  /** ISO instant. Nothing that existed before this can belong to the run. */
  startedAt: string;
  created: CreatedArtifact[];
  touched: TouchedArtifact[];
}

/**
 * A row as the DATABASE describes it.
 *
 * 🔴 The caller must supply every row beneath anything it hopes to delete. A
 * folder whose children were not loaded looks childless, and a childless folder
 * looks safe. That is the one failure this module cannot see for itself.
 */
export interface CandidateRow {
  id: string;
  kind: string;
  label: string;
  /** The row's own `created_at`. Absent or unparseable means no provenance. */
  createdAt?: string | null;
  /** Carried only so the tests can prove it is never consulted. */
  updatedAt?: string | null;
  /** A marker column, if the table has one. `label` is also searched. */
  runMarker?: string | null;
  /** Containment by id, for rows that name their parent. */
  parentId?: string | null;
  /** Containment by path, for the Library, where a folder owns everything under `folder/`. */
  path?: string | null;
}

export type CleanupDecision = "remove" | "restore" | "keep" | "blocked" | "unsafe";

export interface CleanupVerdict {
  id: string;
  kind: string;
  label: string;
  decision: CleanupDecision;
  /** Plain English, written to be pasted into a report the owner will read. */
  reason: string;
  /** What proved it was ours. Absent on everything that is not being removed. */
  witness?: "manifest_id" | "run_marker";
  /** Present on `restore`: what the row looked like before the run changed it. */
  before?: Record<string, unknown>;
}

export interface CleanupPlan {
  runId: string;
  /** Safe to delete or trash. Provenance held, and nothing beneath them objects. */
  remove: CleanupVerdict[];
  /** The run changed these but did not make them. Put them back; never delete. */
  restore: CleanupVerdict[];
  /** Not ours. Left exactly as they are. */
  keep: CleanupVerdict[];
  /** Ours, but something pre-existing lives inside. The container stays. */
  blocked: CleanupVerdict[];
  /** The manifest claims these, the database contradicts it. See `assertCleanupSafe`. */
  unsafe: CleanupVerdict[];
  /** Claimed as created but not present in the rows supplied. Nothing to do. */
  unaccounted: CreatedArtifact[];
}

function instant(raw: string | null | undefined): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Does `parent` contain `child`?
 *
 * Two mechanisms, because the workspace uses two. The Library addresses folders
 * by path, so `Pharmacology` owns `Pharmacology/Week 3.md` by prefix — and the
 * prefix test is already transitive, so one comparison covers the whole depth.
 * Study decks and calendar rows name a parent id instead, so that walk climbs,
 * with a visited set because a cycle in the data must not become a hang here.
 */
function contains(parent: CandidateRow, child: CandidateRow, byId: Map<string, CandidateRow>): boolean {
  if (parent.id === child.id) return false;
  if (parent.path && child.path && child.path.startsWith(`${parent.path}/`)) return true;
  const seen = new Set<string>([child.id]);
  let cursor = child.parentId;
  while (cursor) {
    if (cursor === parent.id) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

/**
 * Decide what an acceptance run is allowed to remove from a real workspace.
 *
 * Pure: it reads a manifest and a set of rows and returns a decision per row.
 * Nothing here deletes anything, which is what lets the whole rule be tested
 * without a database — and what lets a caller print the plan before acting.
 *
 * Safe to rerun. The verdicts come from the state in front of it, so once the
 * removable rows are gone a second pass simply returns an empty `remove`.
 */
export function planAcceptanceCleanup(manifest: RunManifest, rows: CandidateRow[]): CleanupPlan {
  const startedAt = instant(manifest.startedAt);
  if (startedAt === null) {
    // A manifest with no valid start instant cannot authorize anything, and
    // silently authorizing nothing would read as "clean run, nothing to do".
    throw new Error(`acceptance cleanup: manifest.startedAt is not a timestamp (${manifest.startedAt})`);
  }

  const claimed = new Map(manifest.created.map((item) => [item.id, item]));
  const touched = new Map(manifest.touched.map((item) => [item.id, item]));
  const byId = new Map(rows.map((row) => [row.id, row]));

  /** Provenance for this row alone, ignoring anything inside it. */
  const ownVerdict = (row: CandidateRow): CleanupVerdict => {
    const base = { id: row.id, kind: row.kind, label: row.label };
    const named = claimed.has(row.id);
    const marked = markerNamesRun(row.runMarker, manifest.runId) || markerNamesRun(row.label, manifest.runId);
    const bornAt = instant(row.createdAt);

    if (bornAt === null) {
      // Fail closed. The one time this mattered, the thing that looked recent
      // was recent — just not new.
      const reason = named
        ? "the run claims it, but the row has no readable creation time, so nothing proves the run made it"
        : "no readable creation time, so nothing proves the run made it";
      return { ...base, decision: named ? "unsafe" : "keep", reason };
    }
    if (bornAt < startedAt) {
      const reason = `created ${row.createdAt} — before the run started at ${manifest.startedAt}, so it existed first`;
      return { ...base, decision: named ? "unsafe" : "keep", reason };
    }
    if (!named && !marked) {
      return {
        ...base,
        decision: "keep",
        reason: "created during the run, but the run cannot name it — someone else may have made it",
      };
    }
    return {
      ...base,
      decision: "remove",
      reason: `created ${row.createdAt}, after the run started, and ${named ? "the run recorded its id" : "the row carries the run's marker"}`,
      witness: named ? "manifest_id" : "run_marker",
    };
  };

  const own = new Map(rows.map((row) => [row.id, ownVerdict(row)]));

  const plan: CleanupPlan = {
    runId: manifest.runId,
    remove: [],
    restore: [],
    keep: [],
    blocked: [],
    unsafe: [],
    unaccounted: manifest.created.filter((item) => !byId.has(item.id)),
  };

  for (const row of rows) {
    const verdict = own.get(row.id)!;

    if (verdict.decision === "remove") {
      // A container goes only if everything it would take with it may also go.
      const survivor = rows.find(
        (other) => contains(row, other, byId) && own.get(other.id)!.decision !== "remove",
      );
      if (survivor) {
        plan.blocked.push({
          ...verdict,
          decision: "blocked",
          reason: `the run made this, but “${survivor.label}” sits inside it and is not the run's to delete`,
        });
        continue;
      }
      plan.remove.push(verdict);
      continue;
    }

    if (verdict.decision === "unsafe") {
      plan.unsafe.push(verdict);
      continue;
    }

    const changed = touched.get(row.id);
    if (changed) {
      plan.restore.push({
        ...verdict,
        decision: "restore",
        reason: `the run changed this but did not make it — ${verdict.reason}`,
        before: changed.before,
      });
      continue;
    }

    plan.keep.push(verdict);
  }

  return plan;
}

/**
 * Refuse to act on a plan whose bookkeeping is provably wrong.
 *
 * `unsafe` means the manifest claimed a row the database says predates the run.
 * A run that is wrong about one row has no standing to be believed about the
 * others, so this throws rather than printing a warning nobody reads — a bucket
 * that is only reported is a note, not a guardrail. Every caller must pass a
 * plan through here before it deletes or trashes anything.
 */
export function assertCleanupSafe(plan: CleanupPlan): void {
  if (plan.unsafe.length === 0) return;
  const named = plan.unsafe.map((v) => `${v.kind} “${v.label}” (${v.reason})`).join("; ");
  throw new Error(
    `acceptance cleanup refused: run ${plan.runId} claims ${plan.unsafe.length} row(s) that existed before it started — ${named}. `
      + "Nothing has been deleted. Fix the run's bookkeeping before cleaning up.",
  );
}

/** The plan as prose, for a report a non-engineer reads. */
export function cleanupReport(plan: CleanupPlan): string {
  const lines: string[] = [`Cleanup plan for run ${plan.runId}:`];
  const section = (title: string, verdicts: CleanupVerdict[]) => {
    if (verdicts.length === 0) return;
    lines.push(`${title} (${verdicts.length}):`);
    for (const v of verdicts) lines.push(`  - ${v.kind} “${v.label}” — ${v.reason}`);
  };
  section("Remove — made by this run", plan.remove);
  section("Blocked — the run made these, but something of the user's is inside", plan.blocked);
  section("Restore — the run changed these, they were not its to make", plan.restore);
  section("Keep — not the run's", plan.keep);
  section("UNSAFE — the run's records disagree with the database", plan.unsafe);
  if (plan.unaccounted.length > 0) {
    lines.push(`Unaccounted (${plan.unaccounted.length}) — claimed by the run but not found:`);
    for (const item of plan.unaccounted) lines.push(`  - ${item.kind} “${item.label}” (${item.id})`);
  }
  if (plan.remove.length === 0) lines.push("Nothing is safe to delete.");
  return lines.join("\n");
}
