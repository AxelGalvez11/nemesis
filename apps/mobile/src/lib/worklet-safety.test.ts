// A worklet may only do arithmetic. This test enforces that across the app.
//
// WHY THIS EXISTS. On 2026-08-01 an over-the-air update shipped this line in
// note.tsx:
//
//   const pillBarStyle = useAnimatedStyle(() => ({
//     transform: [{ translateY: (1 - chromeReveal.value) * (NOTE_PILL_BAR_HEIGHT + space(6)) }],
//   }));
//
// `space` is an ordinary arrow function in theme/tokens.ts. The Reanimated
// babel plugin captures it by reference into the worklet, and calling it on the
// UI runtime throws. Nothing catches a throw inside a worklet: it goes Hermes ->
// __cxa_throw -> abort, so the PROCESS DIES. Opening a note — from the library,
// the graph, a chat card, a wiki-link, anywhere — crashed the app instantly.
// Five identical SIGABRT reports on build 26 before anyone traced it.
//
// 🔴 THE COST OF THIS CLASS IS WHY IT GETS A TEST RATHER THAN A CODE REVIEW
// NOTE. It typechecks clean (space() really does return a number), it passes
// lint, and `expo export` bundles it happily — the failure exists only on a
// real UI thread. There is no gate before the user's phone except this one.
//
// THE RULE: inside a worklet, touch only shared values, captured NUMBERS, and
// the built-ins below. Need a token, a helper, or any project function? Call it
// on the JS thread and let the worklet read the resulting number.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

/** Hooks and helpers whose callback body is compiled into a worklet. */
const WORKLET_HOSTS = [
  "useAnimatedStyle",
  "useAnimatedProps",
  "useDerivedValue",
  "useAnimatedScrollHandler",
  "useAnimatedReaction",
  "useAnimatedGestureHandler",
  "runOnUI",
];

/** Callable on the UI runtime: JS built-ins plus Reanimated's own worklet API.
 *  Anything NOT here is assumed to be a plain JS function and therefore fatal. */
const UI_THREAD_SAFE = new Set([
  // JS built-ins Hermes provides on both runtimes.
  "Math", "Number", "String", "Boolean", "Array", "Object", "JSON",
  "isNaN", "isFinite", "parseFloat", "parseInt", "Set", "Map", "Date", "RegExp",
  // Reanimated's worklet-safe surface.
  "interpolate", "interpolateColor", "clamp",
  "withTiming", "withSpring", "withDecay", "withDelay", "withSequence", "withRepeat",
  "cancelAnimation", "measure", "scrollTo", "setNativeProps", "dispatchCommand",
  "runOnJS", "makeMutable", "getRelativeCoords", "convertToRGBA", "processColor",
  // Language forms the scanner can see as `name(`.
  "if", "for", "while", "switch", "catch", "return", "typeof", "function", "require",
]);

/** Comments and string literals are stripped first: a scanner that reads them
 *  reports the word "yet" in "no position yet (a frame between…)" as a call,
 *  which is exactly the false positive that would make this test untrustworthy
 *  and get it deleted. */
function stripCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += " ".repeat(stop - i);
      i = stop;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") { j += 2; continue; }
        if (source[j] === quote) { j += 1; break; }
        j += 1;
      }
      out += source.slice(i, j).replace(/[^\n]/g, " ");
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** The balanced (...) that follows `open` (an index pointing AT the paren). */
function balanced(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

interface Offence {
  file: string;
  line: number;
  host: string;
  called: string;
}

/** Every free identifier called as a function inside `body`, minus the ones the
 *  UI runtime actually provides. */
function offendingCalls(body: string): string[] {
  const names: string[] = [];
  for (const call of body.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = call[1];
    if (UI_THREAD_SAFE.has(name) || WORKLET_HOSTS.includes(name)) continue;
    // A method call (`obj.foo(`) rides on a captured object, not a free
    // identifier, so it is a different question and out of scope here.
    if (body[call.index! - 1] === ".") continue;
    names.push(name);
  }
  return names;
}

/** The whole `Gesture.Pan().onUpdate(…).runOnJS(true)` chain starting at `start`.
 *  Walks balanced groups and keeps going while the next thing is another `.`,
 *  so the scan can ask about the chain as a unit rather than one callback. */
function gestureChain(source: string, start: number): string {
  let i = source.indexOf("(", start);
  if (i === -1) return source.slice(start);
  while (i < source.length) {
    const group = balanced(source, i);
    let j = i + group.length;
    while (j < source.length && /\s/.test(source[j])) j += 1;
    if (source[j] !== ".") return source.slice(start, i + group.length);
    j += 1;
    while (j < source.length && /[\w$\s]/.test(source[j])) j += 1;
    if (source[j] !== "(") return source.slice(start, j);
    i = j;
  }
  return source.slice(start);
}

function scan(source: string, file: string): Offence[] {
  const clean = stripCommentsAndStrings(source);
  const offences: Offence[] = [];
  const lineAt = (index: number) => clean.slice(0, index).split("\n").length;

  const hostPattern = new RegExp(`\\b(${WORKLET_HOSTS.join("|")})\\s*\\(`, "g");
  for (const host of clean.matchAll(hostPattern)) {
    const body = balanced(clean, host.index! + host[0].length - 1);
    for (const called of offendingCalls(body)) {
      offences.push({ file, line: lineAt(host.index!), host: host[1], called });
    }
  }

  // react-native-gesture-handler callbacks ALSO run on the UI thread, and they
  // are the likeliest place for the next instance of this bug — every gesture in
  // this app today calls project helpers (dayKeyFromDate, occlusionShapeAt,
  // hapticHoldRegistered…) and is safe ONLY because the chain ends in
  // .runOnJS(true), which moves the whole handler back to the JS thread.
  // 🔴 Drop that one call and the handler becomes a worklet with the exact
  // defect this file exists to prevent — so the chain, not the callback, is the
  // unit of judgement.
  for (const gesture of clean.matchAll(/\bGesture\s*\.\s*[A-Z][\w$]*\s*\(/g)) {
    const chain = gestureChain(clean, gesture.index!);
    if (/\.\s*runOnJS\s*\(\s*true\s*\)/.test(chain)) continue;
    for (const called of offendingCalls(chain)) {
      offences.push({ file, line: lineAt(gesture.index!), host: "Gesture", called });
    }
  }
  return offences;
}

async function sourceFiles(dir: URL): Promise<URL[]> {
  const found: URL[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) {
      if (entry.name === "node_modules") continue;
      found.push(...(await sourceFiles(child)));
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      found.push(child);
    }
  }
  return found;
}

Deno.test("no worklet calls a function that only exists on the JS thread", async () => {
  const src = new URL("../", import.meta.url);
  const offences: Offence[] = [];
  for (const file of await sourceFiles(src)) {
    const shown = decodeURIComponent(file.pathname).split("/apps/mobile/src/")[1] ?? file.pathname;
    offences.push(...scan(await Deno.readTextFile(file), shown));
  }
  const report = offences
    .map((o) => `  ${o.file}:${o.line} — ${o.host} worklet calls ${o.called}()`)
    .join("\n");
  assertEquals(
    offences.length,
    0,
    `A worklet runs on the UI thread, where project functions do not exist. Calling one\n` +
      `throws, and a throw inside a worklet aborts the whole app — it is a crash, not a\n` +
      `render error, and neither tsc, lint, nor expo export will tell you.\n\n` +
      `Two ways out:\n` +
      `  - useAnimatedStyle / useDerivedValue: resolve the value on the JS thread and let\n` +
      `    the worklet read the resulting NUMBER (see PILL_BAR_TRAVEL in app/note.tsx).\n` +
      `  - a Gesture chain: end it in .runOnJS(true), which is what every gesture in this\n` +
      `    app already does, and the handler runs on the JS thread where helpers exist.\n\n` +
      report,
  );
});

// The scanner has to be trusted to be useful, so its two failure modes — missing
// a real call, and inventing one out of prose — are pinned here.
Deno.test("the scanner catches the exact line that shipped the crash", () => {
  const shipped = `
    const pillBarStyle = useAnimatedStyle(() => ({
      opacity: chromeReveal.value,
      transform: [{ translateY: (1 - chromeReveal.value) * (NOTE_PILL_BAR_HEIGHT + space(6)) }],
    }));
  `;
  assertEquals(scan(shipped, "note.tsx").map((o) => o.called), ["space"]);
});

Deno.test("the scanner does not read prose or strings as calls", () => {
  // graph.tsx really does contain "no position yet (a frame between…)"; a naive
  // scanner reports `yet()` and gets itself deleted for crying wolf.
  const prose = `
    const edgeProps = useAnimatedProps(() => {
      // A node index with no position yet (a frame between reseed and first write)
      const label = "call space(6) here";  // also not a call
      return { d: String(Math.round(positions.value[0] * 10) / 10) };
    });
  `;
  assertEquals(scan(prose, "graph.tsx"), []);
});

Deno.test("a gesture that ends in runOnJS(true) may call anything it likes", () => {
  // This is every gesture in the app today. The handler runs on the JS thread,
  // so a project helper is not merely allowed, it is the normal case.
  const safe = `
    const daySwipe = Gesture.Pan()
      .onEnd((event) => {
        const key = dayKeyFromDate(shownDate);
        setDay(daySwipeIntent(event.translationX, key));
      })
      .runOnJS(true);
  `;
  assertEquals(scan(safe, "calendar.tsx"), []);
});

Deno.test("the same gesture WITHOUT runOnJS(true) is the next instance of this bug", () => {
  const unsafe = `
    const daySwipe = Gesture.Pan()
      .onEnd((event) => {
        const key = dayKeyFromDate(shownDate);
        setDay(daySwipeIntent(event.translationX, key));
      });
  `;
  assertEquals(scan(unsafe, "calendar.tsx").map((o) => o.called), [
    "dayKeyFromDate",
    "setDay",
    "daySwipeIntent",
  ]);
});

Deno.test("arithmetic on captured numbers and shared values stays legal", () => {
  const fine = `
    const chromeStyle = useAnimatedStyle(() => ({
      opacity: chromeReveal.value,
      transform: [{ translateY: (chromeReveal.value - 1) * (chromeHeight || 96) }],
    }));
    const travel = useAnimatedStyle(() => ({
      transform: [{ translateY: (1 - chromeReveal.value) * PILL_BAR_TRAVEL }],
    }));
  `;
  assertEquals(scan(fine, "note.tsx"), []);
});
