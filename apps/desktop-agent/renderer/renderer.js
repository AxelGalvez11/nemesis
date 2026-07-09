// UI logic. Talks to the main process only through the `agent` bridge (preload.js). No Node here.
const $ = (id) => document.getElementById(id);
const api = window.agent;
let last = null; // latest status snapshot

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (_) { return ""; } }

const STATUS_LABEL = { generated: "made study material", detected: "new file detected", working: "working", needs_pdf: "needs PDF", error: "couldn't process", portal: "portal checked", skipped: "already done" };

// ── theme ──
function applyTheme(theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}

// ── view routing ──
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === name));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  if (name === "today") loadBrief();
  if (name === "library") loadLibrary();
  if (name === "courses") loadCourses();
}

// ── renderers ──
function renderStatus(s) {
  last = s;
  applyTheme(s.theme);
  $("watchFolder").textContent = s.watchFolder || "not set";
  $("railStatus").textContent = `${s.processedCount || 0} files done · ${s.hasKey ? "key set" : "no key"}`;
  $("assistantUrl").textContent = s.assistantUrl || "";
  const ks = $("keyStatus");
  ks.textContent = s.hasKey ? "Key saved ✓ — generating on new files." : "No key yet — the agent still detects files, but can't generate until a key is added.";
  ks.className = "status " + (s.hasKey ? "ok" : "warn");
  $("pwNote").textContent = s.playwrightReady ? "" : "— browser automation not installed yet (run: npx playwright install chromium)";
  renderActivity(s.activity || []);
  renderPortals(s.portals || []);
}

function renderActivity(activity) {
  const feed = $("activity");
  clear(feed);
  if (!activity.length) { feed.appendChild(el("li", "empty", "Nothing yet. Pick a folder in Connections and drop a lecture PDF into it.")); return; }
  activity.slice(0, 40).forEach((e) => {
    const li = el("li", `item ${e.status}`);
    li.appendChild(el("span", "time", fmtTime(e.at)));
    const body = el("div", "body");
    body.appendChild(el("div", "title", e.source || ""));
    const meta = e.status === "generated"
      ? `${STATUS_LABEL.generated} — "${e.deck || "deck"}", ${e.cardCount || 0} cards${e.course ? " · " + e.course : ""}`
      : `${STATUS_LABEL[e.status] || e.status}${e.reason ? " — " + e.reason : ""}`;
    body.appendChild(el("div", "meta", meta));
    li.appendChild(body);
    if (e.status === "generated" && e.deckDir) {
      const b = el("button", "btn ghost small", "Open");
      b.addEventListener("click", () => api.openDeck(e.deckDir));
      li.appendChild(b);
    }
    feed.appendChild(li);
  });
}

async function loadBrief() {
  const { facts, nudge } = await api.getBrief();
  const stats = $("briefStats");
  clear(stats);
  const defs = [["new decks", facts.newDecks], ["new cards", facts.newCards], ["courses", facts.courses.length], ["needs PDF", facts.needsPdfCount]];
  defs.forEach(([label, n]) => { const s = el("div", "stat"); s.appendChild(el("div", "n", String(n))); s.appendChild(el("div", "l", label)); stats.appendChild(s); });
  $("briefNudge").textContent = nudge || "";
  const decks = $("briefDecks");
  clear(decks);
  if (!facts.decks.length) { decks.appendChild(el("li", "empty", "No new study material today — drop a lecture into your watched folder.")); }
  facts.decks.forEach((d) => decks.appendChild(deckRow(d.deck, `${d.cards} cards`, d.course, d.deckDir)));
}

function deckRow(title, meta, course, deckDir) {
  const li = el("li", "card-row");
  const g = el("div", "grow"); g.appendChild(el("div", "t", title)); g.appendChild(el("div", "m", meta)); li.appendChild(g);
  if (course) li.appendChild(el("span", "pill", course));
  if (deckDir) { const b = el("button", "btn ghost small", "Open"); b.addEventListener("click", () => api.openDeck(deckDir)); li.appendChild(b); }
  return li;
}

async function loadLibrary() {
  const courses = await api.getCourses();
  const list = $("libraryList");
  clear(list);
  const all = courses.flatMap((c) => c.decks.map((d) => Object.assign({ course: c.course }, d)));
  if (!all.length) { list.appendChild(el("li", "empty", "No decks yet.")); return; }
  all.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  all.forEach((d) => list.appendChild(deckRow(d.deck, `${d.cardCount} cards · ${d.source}`, d.course, d.deckDir)));
}

async function loadCourses() {
  const courses = await api.getCourses();
  const wrap = $("coursesList");
  clear(wrap);
  if (!courses.length) { wrap.appendChild(el("div", "empty", "No courses yet — decks get grouped by the folder each lecture lives in.")); return; }
  courses.forEach((c) => {
    const box = el("div", "course");
    box.appendChild(el("h3", null, c.course));
    box.appendChild(el("div", "sub", `${c.decks.length} deck(s) · ${c.cardTotal} cards`));
    const ul = el("ul", "cards");
    c.decks.forEach((d) => ul.appendChild(deckRow(d.deck, `${d.cardCount} cards`, null, d.deckDir)));
    box.appendChild(ul);
    wrap.appendChild(box);
  });
}

function renderPortals(portals) {
  const wrap = $("portalList");
  clear(wrap);
  if (!portals.length) { wrap.appendChild(el("div", "empty", "No portals yet. Add Blackboard, Outlook, or Canvas.")); return; }
  portals.forEach((p) => {
    const row = el("div", "portal");
    row.appendChild(el("span", `dot ${p.connected ? "on" : ""}`));
    const g = el("div", "grow"); g.appendChild(el("div", "t", p.name)); g.appendChild(el("div", "m", `${p.type} · ${p.url}`)); row.appendChild(g);
    if (p.type !== "canvas") {
      const c = el("button", "btn ghost small", p.connected ? "Reconnect" : "Log in");
      c.addEventListener("click", async () => { c.textContent = "opening…"; const r = await api.connectPortal(p.name); c.textContent = p.connected ? "Reconnect" : "Log in"; if (!r.ok) alert("Couldn't connect: " + (r.reason || "unknown")); renderStatus(await api.getStatus()); });
      row.appendChild(c);
    }
    const scan = el("button", "btn ghost small", "Check now");
    scan.addEventListener("click", async () => { scan.textContent = "checking…"; const r = await api.scanPortal(p.name); scan.textContent = "Check now"; alert(r.ok ? `Checked ${p.name}: ${r.title || (r.events ? r.events.length + " recent items" : "ok")}` : "Couldn't check: " + (r.reason || "unknown")); refresh(); });
    row.appendChild(scan);
    const rm = el("button", "btn ghost small", "✕");
    rm.addEventListener("click", async () => { if (confirm(`Remove ${p.name}?`)) renderStatus(await api.removePortal(p.name)); });
    row.appendChild(rm);
    wrap.appendChild(row);
  });
}

async function refresh() { renderStatus(await api.getStatus()); }

// ── wire up ──
window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

  $("pickFolder").addEventListener("click", async () => renderStatus(await api.pickWatchFolder()));
  $("scanToday").addEventListener("click", async () => { await api.scanNow(); refresh(); });
  $("refreshBrief").addEventListener("click", loadBrief);
  $("openOutput").addEventListener("click", () => api.openOutputFolder());
  $("clearKey").addEventListener("click", async () => renderStatus(await api.clearApiKey()));

  $("saveKey").addEventListener("click", async () => {
    const input = $("apiKey"); const st = $("keyStatus");
    st.textContent = "Checking key…"; st.className = "status";
    const r = await api.setApiKey(input.value);
    if (r && r.ok) { input.value = ""; renderStatus(r.status); }
    else { st.textContent = "Key rejected — " + ((r && r.reason) || "unknown"); st.className = "status warn"; }
  });

  document.querySelectorAll(".theme-btn").forEach((b) => b.addEventListener("click", async () => renderStatus(await api.setSetting({ theme: b.dataset.theme }))));

  $("syncAll").addEventListener("click", async () => { const b = $("syncAll"); b.textContent = "syncing…"; await api.syncAll(); b.textContent = "Sync all now"; refresh(); });

  // add-portal modal
  const modal = $("portalModal");
  $("addPortal").addEventListener("click", () => modal.classList.remove("hidden"));
  $("pCancel").addEventListener("click", () => modal.classList.add("hidden"));
  $("pType").addEventListener("change", () => $("canvasFields").classList.toggle("hidden", $("pType").value !== "canvas"));
  $("pSave").addEventListener("click", async () => {
    const p = { name: $("pName").value.trim(), type: $("pType").value, url: $("pUrl").value.trim(), canvasBaseUrl: $("pCanvasBase").value.trim(), token: $("pToken").value.trim() };
    if (!p.name || (p.type === "browser" && !p.url) || (p.type === "canvas" && (!p.canvasBaseUrl || !p.token))) { alert("Fill in the required fields."); return; }
    renderStatus(await api.savePortal(p));
    ["pName", "pUrl", "pCanvasBase", "pToken"].forEach((id) => ($(id).value = ""));
    modal.classList.add("hidden");
  });

  api.onActivity(() => refresh());
  refresh();
});
