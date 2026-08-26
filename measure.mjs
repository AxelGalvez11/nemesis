// Measures OUR page with the SAME getComputedStyle / getBoundingClientRect probes that were run
// against the live ChatGPT, and prints a numeric diff. Nothing here is judged by eye.
//
// 🔴 REAL CHROME, HEADLESS. The in-app browser pane keeps its tab `document.hidden`, so
// requestAnimationFrame never fires there and anything the character draws is a frozen disc.
import { chromium } from "playwright";

const [url, page] = process.argv.slice(2);

// The measured ChatGPT values. Every one of these came off the signed-in app at 1456px.
const EXPECT = {
  common: {
    "content column width": 768,
    "title font-size": "28px",
    "title font-weight": "500",
    "title line-height": "34px",
    "pill height": 36,
    "pill padding": "0px 16px",
    "pill font-size": "14px",
    "pill font-weight": "500",
    "search height": 36,
    "search font-size": "14px",
  },
  list: {
    "shadows in column": 0,
    "row height": 60,
    "row padding": "10px 8px 10px 0px",
    "row divider width": "1px",
    "row name font-size": "14px",
    "row name font-weight": "400",
    "row icon size": 20,
    "column header font-size": "14px",
    "column header font-weight": "400",
  },
  plugins: {
    "grid columns": "384px 384px",
    "grid gap": "16px 8px",
    "app row height": 76,
    "app icon size": 40,
    "app title font-size": "14px",
    "app description font-size": "13px",
    "section header font-size": "14px",
    "section header font-weight": "500",
  },
};

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const tab = await browser.newPage({ viewport: { width: 1456, height: 827 } });
const errors = [];
tab.on("pageerror", (e) => errors.push(e.message));
tab.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await tab.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
await tab.waitForTimeout(2500);

const got = await tab.evaluate(() => {
  const num = (el, prop) => (el ? Math.round(el.getBoundingClientRect()[prop] * 10) / 10 : null);
  const cs = (el, prop) => (el ? getComputedStyle(el)[prop] : null);
  const byText = (t, max) =>
    [...document.querySelectorAll("*")].find(
      (e) => e.textContent.trim() === t && e.children.length === 0 && (!max || e.getBoundingClientRect().height <= max),
    );
  const out = {};
  out["page background"] = getComputedStyle(document.body).backgroundColor;
  const h1 = [...document.querySelectorAll("h1")][0];
  out["title font-size"] = cs(h1, "fontSize");
  out["title font-weight"] = cs(h1, "fontWeight");
  out["title line-height"] = cs(h1, "lineHeight");
  const pill = [...document.querySelectorAll("button")].find((b) => /^(All)$/.test(b.textContent.trim()));
  out["pill height"] = num(pill, "height");
  out["pill padding"] = cs(pill, "padding");
  out["pill font-size"] = cs(pill, "fontSize");
  out["pill font-weight"] = cs(pill, "fontWeight");
  out["pill radius"] = cs(pill, "borderRadius");
  out["pill selected bg"] = cs(pill, "backgroundColor");
  const search = document.querySelector('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]');
  out["search height"] = num(search, "height");
  out["search font-size"] = cs(search, "fontSize");
  // The widest 768-ish block is the content column.
  const col = [...document.querySelectorAll("div,main,section")]
    .filter((e) => !e.hasAttribute("data-pane-shell"))
    .map((e) => ({ e, w: e.getBoundingClientRect().width }))
    .filter((r) => r.w > 700 && r.w < 820)
    .sort((a, b) => b.w - a.w)[0];
  out["content column width"] = col ? Math.round(col.w) : null;
  // A list row: something with a bottom border inside the column.
  const row = [...(col?.e.querySelectorAll("li,a,button,div") ?? [])].find((e) => {
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return parseFloat(s.borderBottomWidth) > 0 && r.height > 40 && r.height < 90 && r.width > 600;
  });
  out["row height"] = num(row, "height");
  out["row padding"] = cs(row, "padding");
  out["row divider width"] = cs(row, "borderBottomWidth");
  out["row divider colour"] = cs(row, "borderBottomColor");
  const icon = row?.querySelector("svg");
  out["row icon size"] = icon ? Math.round(icon.getBoundingClientRect().width) : null;
  // 🔴 THE ROW'S OWN TEXT, WHICH THIS HARNESS LISTED AND NEVER READ. The name is the widest leaf
  // text node in the row; the column heading is the leaf directly above the first row that is not
  // inside it. Both were in EXPECT from the start and always came back NOT FOUND, which reads as a
  // failing page rather than as a missing probe — the worst kind of gap in a checking tool.
  const leaves = (el) => [...(el?.querySelectorAll("*") ?? [])].filter((e) => e.children.length === 0 && e.textContent.trim());
  const name = leaves(row).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  out["row name font-size"] = cs(name, "fontSize");
  out["row name font-weight"] = cs(name, "fontWeight");
  out["row name colour"] = cs(name, "color");
  const heading = leaves(col?.e).find((e) => {
    const r = e.getBoundingClientRect();
    return row && r.bottom <= row.getBoundingClientRect().top && r.bottom > row.getBoundingClientRect().top - 40;
  });
  out["column header font-size"] = cs(heading, "fontSize");
  out["column header font-weight"] = cs(heading, "fontWeight");
  // 🔴 INSIDE THE CONTENT COLUMN, NEVER THE SHELL. `[data-pane-shell]` is itself a grid wider than
  // 700px, so a bare "widest grid" query measured the app's own two-column layout (52px 1404px)
  // and reported it as the plugin grid.
  // Colours and the shadow count, which are how a page stops matching without any size changing.
  out["row divider colour"] = cs(row, "borderBottomColor");
  out["search border"] = cs(search, "borderColor");
  const primary = [...(col?.e.querySelectorAll("button") ?? [])].find((b) => {
    const bg = getComputedStyle(b).backgroundColor;
    return bg && bg !== "rgba(0, 0, 0, 0)" && b.getBoundingClientRect().height > 24;
  });
  out["primary button height"] = num(primary, "height");
  out["primary button bg"] = cs(primary, "backgroundColor");
  // 🔴 THE REFERENCE HAS NONE, ANYWHERE IN THIS COLUMN. A shadow is the easiest thing to add back
  // without noticing and the hardest to spot in a screenshot beside a page that has none.
  out["shadows in column"] = [...(col?.e.querySelectorAll("*") ?? [])].filter(
    (e) => getComputedStyle(e).boxShadow !== "none",
  ).length;
  const grid = [...(col?.e.querySelectorAll("*") ?? [])].find(
    (e) => getComputedStyle(e).display === "grid" && e.getBoundingClientRect().width > 600,
  );
  out["grid columns"] = cs(grid, "gridTemplateColumns");
  out["grid gap"] = cs(grid, "gap");
  return out;
});

const want = { ...EXPECT.common, ...(page === "plugins" ? EXPECT.plugins : EXPECT.list) };
let bad = 0;
console.log(`\n  ${page}  ${url}\n  ${"property".padEnd(28)}${"expected".padEnd(20)}got`);
console.log("  " + "-".repeat(72));
for (const [k, exp] of Object.entries(want)) {
  const g = got[k];
  const ok = String(g) === String(exp);
  if (!ok) bad++;
  console.log(`  ${ok ? " " : "✗"} ${k.padEnd(26)}${String(exp).padEnd(20)}${g ?? "NOT FOUND"}`);
}
for (const [k, v] of Object.entries(got)) if (!(k in want)) console.log(`    ${k.padEnd(26)}${"—".padEnd(20)}${v}`);
if (errors.length) console.log("\n  PAGE ERRORS:\n" + errors.slice(0, 6).map((e) => "   " + e).join("\n"));
console.log(`\n  ${bad} mismatch(es)\n`);
await browser.close();
process.exit(bad > 0 ? 1 : 0);
