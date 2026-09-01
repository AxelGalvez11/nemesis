// Measures OUR week grid with the same probes that were run against the live Google Calendar, and
// prints a numeric diff. Nothing here is judged by eye. Companion to docs/google-calendar-reference.md.
//
//     node measure-calendar.mjs "http://localhost:<port>/dev-preview/calendar-week"
//
// 🔴 IT MUST POINT AT THE DEV PREVIEW, NOT `/calendar`. That route lives in the `(workspace)`
// group; a local dev server has no Supabase credentials, so it renders signed out and empty and
// there is no event block to measure. `/dev-preview/calendar-week` mounts the real `TimeGridView`
// with fixture days, which is what makes the geometry checkable at all.
//
// 🔴 REAL CHROME, HEADLESS. Same reason as measure.mjs: the in-app browser pane keeps its tab
// `document.hidden`, so rAF never fires and anything mid-transition is measured frozen.
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/dev-preview/calendar-week";

// 🔴 THESE ARE GOOGLE'S NUMBERS CONVERTED TO THIS APP'S ROOT, NOT GOOGLE'S PIXELS.
// Google's root is 16px and this app's is 18px (`html { font-size: 112.5% }`), so the like-for-like
// figure is the *rem* value, scaled by 1.125. Copying Google's raw px would draw a grid a ninth too
// tight against text a ninth too large. Source column is section 8 of the reference.
const R = 18 / 16;
const px = (googlePx) => Math.round(googlePx * R * 10) / 10;

const EXPECT = {
  "hour row height": px(48), //            48px  -> 54
  "hour gutter width": px(51.1), //      51.1px  -> 57.5
  "hour label font-size": px(11), //       11px  -> 12.4
  "hour label font-weight": "500",
  "weekday font-size": px(11), //          11px  -> 12.4
  "weekday font-weight": "500",
  "weekday text-transform": "uppercase",
  "date numeral font-size": px(26), //     26px  -> 29.2
  "today disc size": px(46), //            46px  -> 51.8
  "event radius": px(6), //                 6px  -> 6.8
  "event title font-size": px(12), //      12px  -> 13.5
  "grid rule width": "1px",
  "now line width": "2px",
  "now dot size": px(12), //               12px  -> 13.5
  "half-hour rules": 0, // Google draws the hour only.
};

// 🔴 DELIBERATELY NOT ASSERTED. Two of Google's colours are not ours to copy:
//   - the now indicator, `#db372d`. This app has ONE accent (the character's), by owner ruling;
//     a second hue that disagrees with it was removed on purpose.
//   - today's disc, `#0b57d0`. Same reason: ours is the app foreground.
// Both are PRINTED below the table so a change is still visible, just not failed on.
const REPORT_ONLY = ["now line colour", "today disc fill", "grid rule colour", "hour label colour", "weekday letter-spacing"];


const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
tab.on("pageerror", (e) => errors.push(e.message));
tab.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await tab.goto(url, { timeout: 90_000, waitUntil: "networkidle" });
await tab.waitForTimeout(1500);

const got = await tab.evaluate(() => {
  const out = {};
  const round = (n) => (n == null ? null : Math.round(n * 10) / 10);
  const size = (v) => round(parseFloat(v));
  const leaves = [...document.querySelectorAll("*")].filter((e) => !e.children.length);
  const seen = (t) => leaves.find((e) => t.test(e.textContent.trim()) && e.getBoundingClientRect().width > 0);

  // The hour-rule layer: the one absolutely-positioned group whose children all carry a top border.
  // Found by shape rather than class so a Tailwind rename cannot silently stop checking it.
  const layers = [...document.querySelectorAll("div")].filter((e) => {
    const kids = [...e.children];
    return kids.length >= 20 && kids.every((k) => getComputedStyle(k).borderTopWidth !== "0px");
  });
  const rules = layers[0] ? [...layers[0].children] : [];
  if (rules.length >= 2) {
    const tops = rules.map((r) => r.getBoundingClientRect().top).sort((a, b) => a - b);
    const steps = tops.slice(1).map((t, i) => round(t - tops[i]));
    // The modal step IS the hour; anything smaller repeating between them is a half-hour rule.
    const tally = {};
    for (const s of steps) tally[s] = (tally[s] ?? 0) + 1;
    const hour = Number(Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]);
    out["hour row height"] = hour;
    out["half-hour rules"] = steps.filter((s) => s < hour - 1).length;
    out["grid rule width"] = getComputedStyle(rules[0]).borderTopWidth;
    out["grid rule colour"] = getComputedStyle(rules[0]).borderTopColor;
  }

  // Gutter: the fixed-width box holding the hour labels, i.e. the parent of a "9 AM"-ish label.
  const hourLabel = seen(/^\d{1,2}$/) && [...document.querySelectorAll("*")]
    .find((e) => /^\d{1,2}\s*(AM|PM)$/i.test(e.textContent.trim()) && e.children.length <= 2 && e.getBoundingClientRect().width > 0);
  if (hourLabel) {
    const cs = getComputedStyle(hourLabel.firstElementChild ?? hourLabel);
    out["hour label font-size"] = size(cs.fontSize);
    out["hour label font-weight"] = cs.fontWeight;
    out["hour label colour"] = cs.color;
    const gutter = hourLabel.closest("[style*='width']");
    if (gutter) out["hour gutter width"] = round(gutter.getBoundingClientRect().width);
  }

  const weekday = leaves.find((e) => /^(sun|mon|tue|wed|thu|fri|sat)$/i.test(e.textContent.trim()));
  if (weekday) {
    const cs = getComputedStyle(weekday);
    out["weekday font-size"] = size(cs.fontSize);
    out["weekday font-weight"] = cs.fontWeight;
    out["weekday text-transform"] = cs.textTransform;
    out["weekday letter-spacing"] = cs.letterSpacing;
  }

  // The date numeral sits in a round chip; today's is the one with a painted ground.
  // A round chip, detected by radius exceeding its own box rather than by a literal: Tailwind v4
  // compiles `rounded-full` to `calc(infinity * 1px)`, which computes to 179982px here, not 9999px.
  const discs = leaves.filter((e) => {
    const r = e.getBoundingClientRect();
    return /^\d{1,2}$/.test(e.textContent.trim()) && r.width > 0 && parseFloat(getComputedStyle(e).borderRadius) >= r.width;
  });
  if (discs.length) {
    const cs = getComputedStyle(discs[0]);
    out["date numeral font-size"] = size(cs.fontSize);
    out["today disc size"] = round(discs[0].getBoundingClientRect().width);
    const today = discs.find((d) => getComputedStyle(d).backgroundColor !== "rgba(0, 0, 0, 0)");
    out["today disc fill"] = today ? getComputedStyle(today).backgroundColor : "NONE";
  }

  // An event block is the ABSOLUTELY POSITIONED card in a day column, not the button inside it:
  // the button carries the design system's pill radius, so probing it measures the wrong thing.
  const block = [...document.querySelectorAll("div")].find((e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return cs.position === "absolute" && r.top > 180 && r.height > 20 && r.width > 40 && e.querySelector("button");
  });
  if (block) {
    out["event radius"] = size(getComputedStyle(block).borderRadius);
    const label = [...block.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim().length > 3);
    if (label) out["event title font-size"] = size(getComputedStyle(label).fontSize);
  }

  // The now line: NOT found by colour. Ours is the app accent, Google's is red, and a colour probe
  // would simply stop finding it the day the accent changes. It is the one element in the grid that
  // carries a top border in a colour OTHER than the rule colour, and spans a single column.
  const ruleColour = out["grid rule colour"];
  const nowLine = [...document.querySelectorAll("div")].map((e) => ({ e, cs: getComputedStyle(e), r: e.getBoundingClientRect() }))
    .find(({ cs, r }) => cs.borderTopWidth !== "0px" && cs.borderTopColor !== ruleColour && r.width > 40 && r.height <= 8 && r.top > 150);
  if (nowLine) {
    out["now line width"] = nowLine.cs.borderTopWidth;
    out["now line colour"] = nowLine.cs.borderTopColor;
    const dot = nowLine.e.querySelector("span");
    if (dot) out["now dot size"] = round(dot.getBoundingClientRect().width);
  }

  return out;
});

let bad = 0;
console.log(`\n  calendar week grid  ${url}`);
console.log(`  expectations are Google's px x ${Math.round(R * 1000) / 1000} (root 16px -> 18px)\n`);
console.log(`  ${"property".padEnd(26)}${"expected".padEnd(14)}got`);
console.log("  " + "-".repeat(64));
for (const [k, exp] of Object.entries(EXPECT)) {
  const g = got[k];
  const bothNum = typeof exp === "number" && typeof g === "number";
  const ok = bothNum ? Math.abs(g - exp) <= 0.6 : String(g) === String(exp);
  if (!ok) bad++;
  console.log(`  ${ok ? " " : "✗"} ${k.padEnd(24)}${String(exp).padEnd(14)}${g ?? "NOT FOUND"}`);
}
console.log("\n  reported, not asserted (see the note in this file):");
for (const [k, v] of Object.entries(got)) if (!(k in EXPECT)) console.log(`    ${k.padEnd(24)}${REPORT_ONLY.includes(k) ? "" : "?"}  ${v}`);
if (errors.length) console.log("\n  PAGE ERRORS:\n" + errors.slice(0, 6).map((e) => "   " + e).join("\n"));
console.log(`\n  ${bad} mismatch(es)\n`);
await browser.close();
process.exit(bad > 0 ? 1 : 0);
