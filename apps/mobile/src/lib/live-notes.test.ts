// Deno unit tests (repo convention) for a recording's notes logic.
// Run: deno test --no-check apps/mobile/src/lib/live-notes.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildLiveNotesMessages,
  countNotes,
  FINAL_NOTES_MAX_KEPT,
  FINAL_NOTES_MAX_WINDOWS,
  FINAL_NOTES_WINDOW_CHARS,
  LIVE_NOTES_MIN_CHARS,
  LIVE_NOTES_TRANSCRIPT_CHARS,
  liveNotesText,
  mergeLiveNotes,
  parseLiveNotes,
  planFinalNotesWindows,
} from "./live-notes.ts";

Deno.test("messages carry prior notes and clip the transcript tail", () => {
  const messages = buildLiveNotesMessages("x".repeat(9_000), ["alpha", "beta"], "Pharmacology lecture");
  assertEquals(messages.length, 2);
  assertEquals(messages[0].role, "system");
  assert(messages[0].content.includes("up to 10 substantive new notes"));
  assert(messages[1].content.includes("Known session context: Pharmacology lecture"));
  assert(messages[1].content.includes("- alpha\n- beta"));
  assert(messages[1].content.length < 9_000);
});

Deno.test("parse survives fences, junk, and extra keys; rejects non-JSON", () => {
  assertEquals(parseLiveNotes('```json\n{"notes":["First point","Second point"]}\n```'), ["First point", "Second point"]);
  assertEquals(parseLiveNotes('Sure! {"notes":["Only this"],"explore":["ignored"]}'), ["Only this"]);
  assertEquals(parseLiveNotes("no json here"), []);
  assertEquals(parseLiveNotes('{"notes":"not an array"}'), []);
});

Deno.test("parse dedupes, trims whitespace runs, and permits ten substantive notes per pass", () => {
  const notes = parseLiveNotes(JSON.stringify({ notes: ["a  a", "a a", "b", "c", "d", "e", "f", "g"] }));
  assertEquals(notes, ["a a", "b", "c", "d", "e", "f", "g"]);
});

Deno.test("merge dedupes across passes and keeps the richer forty-note board", () => {
  const first = Array.from({ length: 15 }, (_, i) => `note ${i}`);
  const merged = mergeLiveNotes(first, ["note 3", "fresh 1", "fresh 2", "fresh 3", "fresh 4", "fresh 5"]);
  assertEquals(merged.length, 20);
  assertEquals(merged[0], "note 0");
  assertEquals(merged[merged.length - 1], "fresh 5");
  assertEquals(merged.filter((note) => note === "note 3").length, 1);
});

Deno.test("saved notes text joins with plain newlines (web parity)", () => {
  assertEquals(liveNotesText(["one", "two"]), "one\ntwo");
  assertEquals(liveNotesText([]), "");
});

// --- Post-enhance notes rebuild -------------------------------------------

const words = (text: string) => text.split(/\s+/).filter(Boolean);

Deno.test("an empty transcript plans no windows", () => {
  assertEquals(planFinalNotesWindows(""), []);
  assertEquals(planFinalNotesWindows("   \n\n  "), []);
});

Deno.test("a short transcript is one window", () => {
  assertEquals(planFinalNotesWindows("  the mitochondria is the powerhouse  "), [
    "the mitochondria is the powerhouse",
  ]);
});

Deno.test("a long transcript splits into ordered windows within the size cap", () => {
  const paragraph = `${"lecture content ".repeat(500)}\n\n`; // 8000 chars
  const windows = planFinalNotesWindows(paragraph.repeat(6)); // ~48k chars
  assert(windows.length > 1, "expected more than one window");
  // The final window may carry a folded-in sliver, so the true bound is the
  // window size plus one separator plus a sub-minimum tail.
  const bound = FINAL_NOTES_WINDOW_CHARS + 1 + LIVE_NOTES_MIN_CHARS;
  for (const window of windows) {
    assert(window.length <= bound, `window of ${window.length} exceeded ${bound}`);
  }
});

Deno.test("windows never cut a word in half and lose no words", () => {
  const transcript = `${"alpha bravo charlie delta ".repeat(2000)}`; // ~50k chars
  const windows = planFinalNotesWindows(transcript);
  assertEquals(words(windows.join(" ")), words(transcript));
});

Deno.test("a transcript with no breaks at all still advances and terminates", () => {
  const unbroken = "x".repeat(FINAL_NOTES_WINDOW_CHARS * 3);
  const windows = planFinalNotesWindows(unbroken);
  assertEquals(windows.length, 3);
  assertEquals(windows.join("").length, unbroken.length);
});

Deno.test("an absurdly long transcript is capped at the window budget", () => {
  const huge = "word ".repeat(200_000); // 1M chars
  const windows = planFinalNotesWindows(huge);
  assertEquals(windows.length, FINAL_NOTES_MAX_WINDOWS);
});

Deno.test("the end-of-recording pass keeps more notes than one window would, still deduped", () => {
  const previous = Array.from({ length: 38 }, (_, i) => `note ${i}`);
  const merged = mergeLiveNotes(previous, ["note 0", "fresh a", "fresh b"], FINAL_NOTES_MAX_KEPT);
  assertEquals(merged.length, FINAL_NOTES_MAX_KEPT);
  assertEquals(merged.filter((note) => note === "note 0").length, 1);
  assertEquals(merged[merged.length - 1], "fresh b");
});

Deno.test("the default merge ceiling keeps a full lecture board", () => {
  const previous = Array.from({ length: 30 }, (_, i) => `note ${i}`);
  assertEquals(mergeLiveNotes(previous, ["fresh"]).length, 31);
});

// --- The invariant that makes the rebuild mean anything ---------------------
// buildLiveNotesMessages keeps only the LAST LIVE_NOTES_TRANSCRIPT_CHARS of
// whatever it is handed. A window wider than that clip is not summarized, it
// is silently truncated -- the rebuild would appear to work while most of the
// lecture never reached the model. Shipped that way once; never again.

Deno.test("a full-size window reaches the model uncut", () => {
  assert(
    FINAL_NOTES_WINDOW_CHARS <= LIVE_NOTES_TRANSCRIPT_CHARS,
    `a ${FINAL_NOTES_WINDOW_CHARS}-char window is clipped to ${LIVE_NOTES_TRANSCRIPT_CHARS} by the prompt builder`,
  );
  const window = "z".repeat(FINAL_NOTES_WINDOW_CHARS);
  const prompt = buildLiveNotesMessages(window, ["prior note"]).map((m) => m.content).join("\n");
  assert(prompt.includes(window), "the prompt builder dropped part of a full-size window");
});

Deno.test("every planned window reaches the model uncut, for a real-length lecture", () => {
  const lecture = "the patient presents with resistant hypertension. ".repeat(1000); // ~50k chars
  for (const window of planFinalNotesWindows(lecture)) {
    const prompt = buildLiveNotesMessages(window, []).map((m) => m.content).join("\n");
    assert(prompt.includes(window), `a ${window.length}-char window was clipped by the prompt builder`);
  }
});

// --- Boundary-choice behaviour (each pinned so a mutation cannot pass) -------

Deno.test("a break in the window's first half is ignored, so windows stay full", () => {
  const early = `head\n\n${"word ".repeat(FINAL_NOTES_WINDOW_CHARS)}`;
  const [first] = planFinalNotesWindows(early);
  assert(first !== undefined);
  assert(
    first.length > FINAL_NOTES_WINDOW_CHARS / 2,
    `an early break shrank the window to ${first.length}`,
  );
});

Deno.test("break marks are preferred paragraph > line > sentence > space", () => {
  const filler = (n: number) => "x".repeat(n);
  const at = Math.floor(FINAL_NOTES_WINDOW_CHARS * 0.6);
  // A paragraph break at 60% competes with a sentence end and a space later on.
  const text = `${filler(at)}\n\n${filler(100)}. ${filler(100)} ${filler(FINAL_NOTES_WINDOW_CHARS)}`;
  const [first] = planFinalNotesWindows(text);
  assertEquals(first, filler(at));
});

Deno.test("no window starts or ends on stray whitespace", () => {
  const text = `${"alpha bravo\n\ncharlie delta\n".repeat(3000)}`;
  for (const window of planFinalNotesWindows(text)) {
    assert(!/^\s/.test(window), `window started with whitespace: ${JSON.stringify(window.slice(0, 8))}`);
    assert(!/\s$/.test(window), `window ended with whitespace: ${JSON.stringify(window.slice(-8))}`);
  }
});

Deno.test("window count follows the size constant exactly", () => {
  const chunk = `${"a".repeat(FINAL_NOTES_WINDOW_CHARS - 2)}\n\n`;
  assertEquals(planFinalNotesWindows(chunk.repeat(5)).length, 5);
  assertEquals(planFinalNotesWindows(chunk).length, 1);
});

Deno.test("the window budget spans a longer recording than the server will accept", () => {
  // The transcription route caps a recording at 3 hours; speech runs roughly
  // 750 chars/minute. The rebuild must reach past that, or long lectures get
  // silently half-summarized.
  const threeHoursOfChars = 750 * 60 * 3;
  assert(
    FINAL_NOTES_WINDOW_CHARS * FINAL_NOTES_MAX_WINDOWS > threeHoursOfChars,
    `budget of ${FINAL_NOTES_WINDOW_CHARS * FINAL_NOTES_MAX_WINDOWS} chars cannot cover ${threeHoursOfChars}`,
  );
});

Deno.test("the note ceiling is actually reachable", () => {
  // A ceiling below what the windows can produce is a dead constant, and the
  // test pinning it would be validating a state production never enters.
  assert(FINAL_NOTES_MAX_WINDOWS * 6 >= FINAL_NOTES_MAX_KEPT);
});

// --- Not spending a call on a sliver, not trading away coverage -------------

Deno.test("a sliver of a tail rides along instead of costing a model call", () => {
  // Text that cuts cleanly at a window boundary and leaves a few words over.
  const body = `${"a".repeat(FINAL_NOTES_WINDOW_CHARS - 2)}\n\n`;
  const windows = planFinalNotesWindows(`${body}and then`);
  assertEquals(windows.length, 1);
  assert(windows[0]?.endsWith("and then"), "the sliver was dropped instead of folded in");
});

Deno.test("a real tail still gets its own window", () => {
  const body = `${"a".repeat(FINAL_NOTES_WINDOW_CHARS - 2)}\n\n`;
  const tail = "b".repeat(LIVE_NOTES_MIN_CHARS + 10);
  const windows = planFinalNotesWindows(`${body}${tail}`);
  assertEquals(windows.length, 2);
  assertEquals(windows[1], tail);
});

Deno.test("a short recording is still summarized even if it is a sliver", () => {
  assertEquals(planFinalNotesWindows("short thought"), ["short thought"]);
});

Deno.test("countNotes counts bullets in a saved notes blob", () => {
  assertEquals(countNotes("one\ntwo\nthree"), 3);
  assertEquals(countNotes("one\n\n  \ntwo"), 2);
  assertEquals(countNotes(""), 0);
  assertEquals(countNotes(undefined), 0);
  assertEquals(countNotes(null), 0);
});

Deno.test("a window never starts on an orphaned separator", () => {
  // The sentence break is the case that matters: trim() quietly hides a
  // newline that lands at the head of a window, but a stray "." would sit
  // there in plain sight and read as a broken note. This is what catches an
  // off-by-one in windowEnd's `at + mark.length`.
  const windows = planFinalNotesWindows(`${"x".repeat(200)}. `.repeat(200));
  assert(windows.length > 1, "expected several windows");
  for (const window of windows) {
    assert(
      /^[\p{L}\p{N}]/u.test(window),
      `window began on a separator: ${JSON.stringify(window.slice(0, 12))}`,
    );
  }
});

Deno.test("a SPEAKER-LABELLED transcript plans the same number of windows as a plain one", () => {
  // Diarization (2026-07-27) means the server's transcript can now arrive as
  // "Speaker A: …" blocks separated by blank lines instead of paragraphs. Those
  // blank lines are break marks, so a naive planner could cut on the first one
  // in every window and explode the window count — which is the notes spend per
  // lecture, the exact thing this change is optimizing.
  const sentence = `${"word ".repeat(24)}. `;
  const plain = sentence.repeat(120);
  const labelled = Array.from({ length: 120 }, (_, i) => `Speaker ${i % 2 === 0 ? "A" : "B"}: ${sentence}`).join("\n\n");
  const plainWindows = planFinalNotesWindows(plain).length;
  const labelledWindows = planFinalNotesWindows(labelled).length;
  // Labels add characters, so a window or two more is expected; an explosion is not.
  assert(
    labelledWindows <= plainWindows + 3,
    `labelled ${labelledWindows} vs plain ${plainWindows} — speaker blocks should not multiply the passes`,
  );
  assert(labelledWindows >= plainWindows, "labelled text is longer, so never fewer windows");
});

Deno.test("no speaker block is cut mid-label", () => {
  const labelled = Array.from({ length: 60 }, (_, i) => `Speaker ${i % 2 === 0 ? "A" : "B"}: ${"word ".repeat(30)}.`).join("\n\n");
  for (const window of planFinalNotesWindows(labelled)) {
    assert(!/^[AB]:/.test(window), `window starts on a severed label: ${window.slice(0, 40)}`);
    assert(!window.endsWith("Speaker"), `window ends on a severed label: ${window.slice(-40)}`);
  }
});
