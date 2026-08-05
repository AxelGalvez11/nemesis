import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCleanupSafe,
  type CandidateRow,
  type CleanupPlan,
  cleanupReport,
  markerNamesRun,
  planAcceptanceCleanup,
  type RunManifest,
  runMarker,
} from "./acceptance-cleanup.ts";

const ids = (plan: CleanupPlan, bucket: "remove" | "keep" | "restore" | "blocked" | "unsafe") =>
  plan[bucket].map((v) => v.id).sort();

/**
 * The 2026-08-05 incident, as data. **Real ids, real timestamps**, read back out
 * of the production database on 2026-08-05 (`readable_library_documents` and
 * `library_sources`).
 *
 * The owner made a folder named `test` the previous evening. During the
 * acceptance pass they went on using the app — they recorded a session about GR
 * Corolla trims, which landed a 3,574-character note, its folder page and its
 * source file inside that folder at 17:56–17:57. Check 11 of the pass then
 * renamed the folder to `Scratch` and back, so every row underneath carried a
 * fresh `updated_at`, and I told the owner the folder was mine.
 *
 * This fixture is worth more than a synthetic one because the five rows fail the
 * provenance test in TWO different ways, and both halves of the rule are needed:
 *
 *  - the folder and its page predate the run — the **timestamp** refuses them;
 *  - the recording note, its page and its source were created INSIDE the run
 *    window — only **identity** refuses them. A rule that trusted creation time
 *    alone would have deleted the owner's recording.
 */
const RUN_STARTED = "2026-08-05T17:30:00.000Z";
const RENAMED_AT = "2026-08-05T18:01:22.000Z";

const preExisting: CandidateRow[] = [
  {
    id: "41c0e5fc-1547-4387-91ba-7aeaa2e05edc",
    kind: "library_folder",
    label: "test",
    path: "test",
    createdAt: "2026-08-04T20:58:03.243Z",
    updatedAt: RENAMED_AT,
  },
  {
    id: "f56ff029-3b94-4b8e-bd42-41bd202fe5cd",
    kind: "library_note",
    label: "test",
    path: "test/test.md",
    createdAt: "2026-08-04T20:58:04.724Z",
    updatedAt: RENAMED_AT,
  },
  // 🔴 The three below were born DURING the run. Nothing about their timestamps
  // says they are the owner's; only the fact that no run ever named them does.
  {
    id: "9f7c1a38-b1d6-4672-ae65-7b8d75486774",
    kind: "library_note",
    label: "GR Corolla trims, charging, and why the premium loses fast-charging",
    path: "test/Lectures/GR Corolla trims, charging, and why the premium loses fast-charging.md",
    createdAt: "2026-08-05T17:56:05.517Z",
    updatedAt: RENAMED_AT,
  },
  {
    id: "6ba51bfd-015b-41bc-a0c8-46f4743c876b",
    kind: "library_note",
    label: "Lectures",
    path: "test/Lectures/Lectures.md",
    createdAt: "2026-08-05T17:56:26.186Z",
    updatedAt: RENAMED_AT,
  },
  {
    id: "3a663fd4-d74d-424c-bb25-ece69ad5b10f",
    kind: "library_source",
    label: "GR Corolla trims, charging, and why the premium loses fast-charging.md",
    path: "test/Lectures",
    createdAt: "2026-08-05T17:57:13.637Z",
  },
];

const [FOLDER, FOLDER_PAGE, COROLLA_NOTE, LECTURES_PAGE, COROLLA_SOURCE] = preExisting.map((r) => r.id);

const probes: CandidateRow[] = [
  {
    id: "e-probe",
    kind: "calendar_event",
    label: "Phase 2 Probe Exam",
    createdAt: "2026-08-05T17:58:02.000Z",
    updatedAt: "2026-08-05T17:58:02.000Z",
  },
  {
    id: "n-probe",
    kind: "library_note",
    label: "Probe note",
    path: "Probe Folder/Probe note.md",
    createdAt: "2026-08-05T18:05:41.000Z",
    updatedAt: "2026-08-05T18:05:41.000Z",
  },
  {
    id: "f-probe",
    kind: "library_folder",
    label: "Probe Folder",
    path: "Probe Folder",
    createdAt: "2026-08-05T18:07:09.000Z",
    updatedAt: "2026-08-05T18:07:09.000Z",
  },
];

const manifest: RunManifest = {
  runId: "phase2-a1b2c3",
  startedAt: RUN_STARTED,
  created: [
    { id: "e-probe", kind: "calendar_event", label: "Phase 2 Probe Exam" },
    { id: "n-probe", kind: "library_note", label: "Probe note" },
    { id: "f-probe", kind: "library_folder", label: "Probe Folder" },
  ],
  touched: [
    { id: FOLDER, kind: "library_folder", label: "test", before: { path: "test" } },
  ],
};

// 🔴 THE REGRESSION. The owner asked for exactly this case: a pre-existing user
// folder with real content, mutated during an acceptance run. Cleanup takes the
// three probes and nothing else — the folder, the recording note, both folder
// pages and the source file all survive being renamed twice by the test.
test("a pre-existing folder mutated by the run survives; only the run's own artifacts go", () => {
  const plan = planAcceptanceCleanup(manifest, [...preExisting, ...probes]);

  assert.deepEqual(ids(plan, "remove"), ["e-probe", "f-probe", "n-probe"]);
  assert.deepEqual(ids(plan, "restore"), [FOLDER], "the folder the run renamed is restored, never deleted");
  assert.deepEqual(
    ids(plan, "keep"),
    [COROLLA_SOURCE, LECTURES_PAGE, COROLLA_NOTE, FOLDER_PAGE].sort(),
  );
  assert.equal(plan.unsafe.length, 0);
  assert.equal(plan.blocked.length, 0);

  // Said the other way round, because this is the sentence that was wrong in
  // production: nothing the owner made is in the delete list.
  for (const row of preExisting) {
    assert.ok(!ids(plan, "remove").includes(row.id), `${row.label} must not be removable`);
  }
  assertCleanupSafe(plan);
});

// 🔴 BOTH HALVES OF THE RULE ARE LOAD-BEARING, and this fixture proves it on real
// rows: the owner's recording note was created 26 minutes INTO the run. A gate
// that authorized on creation time alone would have deleted it.
test("the owner's rows created during the run are refused on identity, not on time", () => {
  const plan = planAcceptanceCleanup(manifest, [...preExisting, ...probes]);
  const reasonFor = (id: string) => plan.keep.find((v) => v.id === id)!.reason;

  for (const id of [COROLLA_NOTE, LECTURES_PAGE, COROLLA_SOURCE]) {
    assert.match(reasonFor(id), /the run cannot name it/, "born inside the window, saved by identity");
  }
  for (const id of [FOLDER_PAGE]) {
    assert.match(reasonFor(id), /before the run started/, "born before the window, saved by time");
  }
});

test("the run's own note keeps its content — restore carries the prior state, it does not revert it", () => {
  const plan = planAcceptanceCleanup(manifest, [...preExisting, ...probes]);
  const restored = plan.restore[0]!;
  assert.deepEqual(restored.before, { path: "test" });
  assert.match(restored.reason, /changed this but did not make it/);
});

// 🔴 THE RULE ITSELF. `updated_at` is the field that lied. Two rows, identical
// but for creation time, and only the one actually born inside the run may go.
test("recency is not authorship — updated_at never authorizes a delete", () => {
  const shared = { kind: "library_note", label: "note", updatedAt: RENAMED_AT } as const;
  const rows: CandidateRow[] = [
    { ...shared, id: "old", createdAt: "2026-08-04T20:58:03.000Z" },
    { ...shared, id: "new", createdAt: "2026-08-05T17:30:00.000Z" },
  ];
  const plan = planAcceptanceCleanup(
    {
      runId: "r1",
      startedAt: RUN_STARTED,
      created: [{ id: "new", kind: "library_note", label: "note" }],
      touched: [],
    },
    rows,
  );
  assert.deepEqual(ids(plan, "remove"), ["new"]);
  assert.deepEqual(ids(plan, "keep"), ["old"]);
  assert.match(plan.keep[0]!.reason, /before the run started/);
});

test("no creation time means no permission — missing and unparseable both fail closed", () => {
  const rows: CandidateRow[] = [
    { id: "a", kind: "library_note", label: "a", createdAt: null, updatedAt: RENAMED_AT },
    { id: "b", kind: "library_note", label: "b", createdAt: "not a date" },
    { id: "c", kind: "library_note", label: "c" },
  ];
  const plan = planAcceptanceCleanup(
    { runId: "r1", startedAt: RUN_STARTED, created: [], touched: [] },
    rows,
  );
  assert.deepEqual(ids(plan, "remove"), []);
  assert.deepEqual(ids(plan, "keep"), ["a", "b", "c"]);
});

// 🔴 THE MANIFEST CANNOT SELF-CERTIFY. A run that claims a row the database says
// is older is a run whose records are wrong, and a run whose records are wrong
// has no standing to be believed about the rest. It stops, it does not warn.
test("a claim the database contradicts is unsafe, and unsafe blocks the whole cleanup", () => {
  const wrong: RunManifest = {
    ...manifest,
    created: [...manifest.created, { id: FOLDER, kind: "library_folder", label: "test" }],
    touched: [],
  };
  const plan = planAcceptanceCleanup(wrong, [...preExisting, ...probes]);

  assert.deepEqual(ids(plan, "unsafe"), [FOLDER]);
  assert.ok(!ids(plan, "remove").includes(FOLDER), "a contradicted claim is never removable");
  assert.throws(() => assertCleanupSafe(plan), /refused/);
  assert.throws(() => assertCleanupSafe(plan), /Nothing has been deleted/);
});

test("a claimed row with no creation time is unsafe too, not merely kept", () => {
  const plan = planAcceptanceCleanup(
    {
      runId: "r1",
      startedAt: RUN_STARTED,
      created: [{ id: "x", kind: "library_note", label: "x" }],
      touched: [],
    },
    [{ id: "x", kind: "library_note", label: "x", createdAt: null }],
  );
  assert.deepEqual(ids(plan, "unsafe"), ["x"]);
  assert.throws(() => assertCleanupSafe(plan));
});

// 🔴 THE SUBTREE RULE. `delete_library_folder` takes everything beneath it. A
// folder the run genuinely created still cannot go once something of the user's
// has been moved inside — which is one move away from the real incident.
test("a container the run made is blocked when anything inside it is not the run's", () => {
  const rows: CandidateRow[] = [
    ...probes,
    {
      id: "n-user",
      kind: "library_note",
      label: "Krebs cycle summary",
      path: "Probe Folder/Krebs cycle summary.md",
      createdAt: "2026-07-30T09:00:00.000Z",
      updatedAt: RENAMED_AT,
    },
  ];
  const plan = planAcceptanceCleanup(manifest, rows);

  assert.deepEqual(ids(plan, "blocked"), ["f-probe"]);
  assert.deepEqual(ids(plan, "remove"), ["e-probe", "n-probe"], "the run's own note inside it may still go");
  assert.deepEqual(ids(plan, "keep"), ["n-user"]);
  assert.match(plan.blocked[0]!.reason, /Krebs cycle summary/);
});

test("containment by parent id blocks the same way as containment by path", () => {
  const rows: CandidateRow[] = [
    { id: "d-probe", kind: "study_deck_folder", label: "Probe decks", createdAt: "2026-08-05T17:30:00.000Z" },
    { id: "d-mid", kind: "study_deck_folder", label: "mid", parentId: "d-probe", createdAt: "2026-08-05T17:31:00.000Z" },
    { id: "d-user", kind: "study_deck", label: "Pharm 1", parentId: "d-mid", createdAt: "2026-06-01T00:00:00.000Z" },
  ];
  const plan = planAcceptanceCleanup(
    {
      runId: "r1",
      startedAt: RUN_STARTED,
      created: [
        { id: "d-probe", kind: "study_deck_folder", label: "Probe decks" },
        { id: "d-mid", kind: "study_deck_folder", label: "mid" },
      ],
      touched: [],
    },
    rows,
  );
  // Two levels up from the user's deck, and the block still reaches.
  assert.deepEqual(ids(plan, "blocked"), ["d-mid", "d-probe"]);
  assert.deepEqual(ids(plan, "remove"), []);
});

test("a cycle in parent ids terminates instead of hanging", () => {
  const rows: CandidateRow[] = [
    { id: "a", kind: "folder", label: "a", parentId: "b", createdAt: "2026-08-05T17:30:00.000Z" },
    { id: "b", kind: "folder", label: "b", parentId: "a", createdAt: "2026-08-05T17:31:00.000Z" },
  ];
  const plan = planAcceptanceCleanup(
    {
      runId: "r1",
      startedAt: RUN_STARTED,
      created: [{ id: "a", kind: "folder", label: "a" }, { id: "b", kind: "folder", label: "b" }],
      touched: [],
    },
    rows,
  );
  assert.equal(plan.remove.length + plan.blocked.length, 2);
});

// A run can crash between making a row and writing the id down. The marker it
// stamped into the row itself covers that gap — but only for its own runId.
test("a row carrying this run's marker is removable even when the id was never recorded", () => {
  const rows: CandidateRow[] = [
    {
      id: "orphan",
      kind: "calendar_event",
      label: `Probe Exam [${runMarker("phase2-a1b2c3")}]`,
      createdAt: "2026-08-05T17:40:00.000Z",
    },
    {
      id: "someone-else",
      kind: "calendar_event",
      label: `Probe Exam [${runMarker("some-other-run")}]`,
      createdAt: "2026-08-05T17:41:00.000Z",
    },
    { id: "unmarked", kind: "calendar_event", label: "Probe Exam", createdAt: "2026-08-05T17:42:00.000Z" },
  ];
  const plan = planAcceptanceCleanup(
    { runId: "phase2-a1b2c3", startedAt: RUN_STARTED, created: [], touched: [] },
    rows,
  );
  assert.deepEqual(ids(plan, "remove"), ["orphan"]);
  assert.deepEqual(ids(plan, "keep"), ["someone-else", "unmarked"]);
  assert.equal(plan.remove[0]!.witness, "run_marker");
});

test("a marker still needs a creation time inside the run", () => {
  const plan = planAcceptanceCleanup(
    { runId: "r1", startedAt: RUN_STARTED, created: [], touched: [] },
    [{
      id: "x",
      kind: "library_note",
      label: `old note [${runMarker("r1")}]`,
      createdAt: "2026-08-04T20:58:03.000Z",
      updatedAt: RENAMED_AT,
    }],
  );
  assert.deepEqual(ids(plan, "remove"), []);
});

test("a bare fixture name is not identity — the marker carries the run id", () => {
  assert.equal(markerNamesRun("probe", "r1"), false);
  assert.equal(markerNamesRun(runMarker("r1"), "r1"), true);
  assert.equal(markerNamesRun(runMarker("r10"), "r1"), true, "substring token, documented");
  assert.equal(markerNamesRun(runMarker("r1"), "r2"), false);
  assert.equal(markerNamesRun(null, "r1"), false);
  assert.equal(markerNamesRun(runMarker("r1"), ""), false);
});

// The structural guard: whatever the buckets say, every id in `remove` must be
// one the run can name. A future edit that widens provenance trips this.
test("nothing reaches remove without an identity witness", () => {
  const plan = planAcceptanceCleanup(manifest, [...preExisting, ...probes]);
  const named = new Set(manifest.created.map((c) => c.id));
  for (const v of plan.remove) {
    assert.ok(v.witness, `${v.label} was removed with no witness`);
    if (v.witness === "manifest_id") assert.ok(named.has(v.id));
  }
  const removing = new Set(ids(plan, "remove"));
  for (const bucket of ["keep", "restore", "blocked", "unsafe"] as const) {
    for (const v of plan[bucket]) assert.ok(!removing.has(v.id), `${v.id} is in two buckets`);
  }
});

test("safe to rerun — once the run's rows are gone the plan is empty", () => {
  const first = planAcceptanceCleanup(manifest, [...preExisting, ...probes]);
  const removed = new Set(ids(first, "remove"));
  const after = [...preExisting, ...probes].filter((r) => !removed.has(r.id));
  const second = planAcceptanceCleanup(manifest, after);
  assert.deepEqual(ids(second, "remove"), []);
  assert.deepEqual(ids(second, "keep"), [COROLLA_SOURCE, LECTURES_PAGE, COROLLA_NOTE, FOLDER_PAGE].sort());
  assert.equal(second.unaccounted.length, 3, "the rows it made are gone, and it says so");
});

test("a manifest with no readable start instant authorizes nothing, loudly", () => {
  assert.throws(
    () => planAcceptanceCleanup({ runId: "r1", startedAt: "whenever", created: [], touched: [] }, []),
    /startedAt is not a timestamp/,
  );
});

test("the report names what survives and why", () => {
  const text = cleanupReport(planAcceptanceCleanup(manifest, [...preExisting, ...probes]));
  assert.match(text, /Remove — made by this run \(3\)/);
  assert.match(text, /GR Corolla/);
  assert.match(text, /Restore/);
  assert.doesNotMatch(text, /UNSAFE/);

  const empty = cleanupReport(planAcceptanceCleanup(manifest, preExisting));
  assert.match(empty, /Nothing is safe to delete\./);
});
