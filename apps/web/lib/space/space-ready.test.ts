import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { deadControls } from "./dead-controls";

// ── Nothing in the workspace pretends ───────────────────────────────────────────────────────────────────────────────
//
// The workspace frontend arrived as a measured copy whose server features had nothing behind them: AI answers were
// canned text after a fake "Thinking" delay, the invite box sent nothing, meeting notes and the inbox were shells.
// Until a milestone builds one (docs/space/PLAN.md), every way into it sits behind a READY flag in main.js.

const main = readFileSync(new URL("../../space/app/main.js", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../../space/app/runtime.js", import.meta.url), "utf8");

/**
 * How each unbuilt feature is reached, and the flag that has to sit on the same line. "dead" marks labels that real
 * controls share elsewhere (a database view's Rename, a row's Duplicate): those count only when nothing handles them.
 */
const ENTRY_POINTS: Array<[string, RegExp, "dead"?]> = [
  [
    "ai",
    /\['bulb', 'Start a draft'|\['bulb', 'Research a topic'|class="sb-newchat"|\['chatBubble', 'Chat', openNewChat\]|\['chat', 'chatBubble', 'Chat'\]|key: 'agents'|(?<!-)label="Use with AI"|\{ n: 'Ask AI'|\{ n: 'Suggest edits'|(?<!-)label="Suggest edits"|(?<!-)label="Translate"|\{ n: 'Skills'|placeholder="Edit with AI"|(?<!-)label="AI Autofill"|aria-label="AI Autofill"|\['magicWandSmall', ''\]|<\$\{AiSidePanel\}|toLowerCase\(\) === 'o'/,
  ],
  [
    "meetings",
    /\['meet', 'AI Meeting Notes'|\['microphone', 'AI Meeting Notes'|'paperMicrophone', 'AI Meeting Notes'\]|g: 'Suggested'|\['meetings', 'paperMicrophone', 'Meetings'\]|key: 'meetings'/,
  ],
  ["inbox", /\['inbox', 'inbox', 'Inbox'\]|(?<!-)label="Notify me"|aria-label="Notification settings"/],
  [
    "invites",
    /placeholder="Email, separated by commas"|<span>Invite members<\/span>|\['publish', 'Publish'\]|class="shp-adv"|class="shp-publish"|class="ft-share"/,
  ],
  ["importExport", /(?<!-)label="Import"|(?<!-)label="Export"|<span>Import<\/span>/],
  ["history", /(?<!-)label="Version history"|(?<!-)label="Updates & analytics"/],
  [
    "pageOps",
    /(?<!-)label="Duplicate" (sc="⌘D"|chev)|(?<!-)label="Rename"|(?<!-)label="Move to" sc="⌘⇧P"\/>|(?<!-)label="Customize page"|(?<!-)label="Undo"|(?<!-)label="Open in side peek"/,
    "dead",
  ],
  ["automations", /aria-label="Automations"|'nsp-collection-automation-edit-view'/],
  ["searchFilters", /<span>Title only<\/span>|<span>Best matches<\/span>|n="filterCircle"/],
  ["maps", /\['map', 'viewMap', 'Map'\]/],
];

/** Whether the tag around position `at` handles a press itself. */
function handled(line: string, at: number): boolean {
  const end = line.indexOf(">", at);
  return /on(Click|MouseDown|PointerDown)=/.test(line.slice(line.lastIndexOf("<", at), end === -1 ? undefined : end));
}

test("🔴🔴 every way into a feature with no server behind it sits behind its READY flag", () => {
  const declared = main.match(/const READY = \{([^}]*)\}/)?.[1] ?? "";
  const flags = new Set([...declared.matchAll(/(\w+): (?:true|false)/g)].map((m) => m[1]));
  for (const [flag] of ENTRY_POINTS) assert.ok(flags.has(flag), `READY in main.js has no ${flag} flag`);
  const misses: string[] = [];
  main.split("\n").forEach((line, i) => {
    if (line.trimStart().startsWith("//")) return;
    for (const [flag, entry, only] of ENTRY_POINTS) {
      if (line.includes(`READY.${flag}`)) continue;
      const escaped = [...line.matchAll(new RegExp(entry.source, "g"))].some((m) => only !== "dead" || !handled(line, m.index ?? 0));
      if (escaped) misses.push(`main.js:${i + 1} reaches ${flag} without READY.${flag}`);
    }
  });
  assert.deepEqual(misses, []);
});

test("🔴 the copied menu items for features Nemesis is not building are gone", () => {
  for (const gone of ["Open in Mac app", "Turn into wiki", 'label="Connections"', "Learn about pages"]) {
    assert.ok(!main.includes(gone), `main.js still offers ${gone}`);
  }
});

test("🔴 no text tells a learner to use a feature that is switched off", () => {
  assert.doesNotMatch(runtime, /invite a classmate/i, "the first-visit page promises invites");
  assert.doesNotMatch(main, /open Share on that page and add their email/, "Settings promises invites");
});

/**
 * 🔴 THE COUNT ONLY GOES DOWN. Buttons and menu items with no handler of their own, most of them in screens whose
 * milestone has not come yet (docs/space/PLAN.md). Wiring or removing one means lowering BUDGET; adding one fails.
 */
const BUDGET = 109;

test("🔴 the number of controls that do nothing does not grow", () => {
  const dead = deadControls(main);
  assert.equal(
    dead.length,
    BUDGET,
    dead.length > BUDGET
      ? `a control does nothing when pressed; give it a handler or hide it behind READY:\n${dead.join("\n")}`
      : `${BUDGET - dead.length} dead controls were fixed: lower BUDGET to ${dead.length}`,
  );
});
