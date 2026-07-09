// Browser-automation connector for logged-in school portals (Blackboard/Outlook/Canvas). The whole
// design point (from the research): the student logs in ONCE in a real browser we open; Playwright's
// launchPersistentContext saves that session to an app-private profile dir, so scheduled re-scans reuse
// it — we never store the password, and the login comes from the student's own machine (no datacenter
// security flags, 2FA already satisfied). Playwright is required LAZILY so the app runs without it and
// the UI can offer to install it.

const path = require("path");
const fs = require("fs");

function tryLoadPlaywright() {
  try { return require("playwright"); } catch (_) { return null; }
}

function isAvailable() {
  return Boolean(tryLoadPlaywright());
}

function profileDir(baseDir, name) {
  const dir = path.join(baseDir, "portals", slug(name));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function slug(s) { return String(s || "portal").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "portal"; }

const LOGIN_RE = /(login|signin|sign-in|sso|auth|idp|adfs|okta|duo)/i;

/**
 * Open a real browser at the portal's login URL and wait for the student to sign in. The persistent
 * profile keeps the session for later headless scans. Resolves when the browser leaves the login page
 * (or the user closes the window, or a timeout).
 * @param {{ baseDir: string, name: string, url: string, timeoutMs?: number }} args
 * @returns {Promise<{ ok: boolean, reason?: string, landedUrl?: string }>}
 */
async function connectPortal(args) {
  const pw = tryLoadPlaywright();
  if (!pw) return { ok: false, reason: "playwright-not-installed" };
  const dir = profileDir(args.baseDir, args.name);
  const timeoutMs = args.timeoutMs || 5 * 60 * 1000;
  let ctx;
  try {
    ctx = await pw.chromium.launchPersistentContext(dir, { headless: false, viewport: null });
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(args.url, { waitUntil: "domcontentloaded" }).catch(() => {});
    const start = Date.now();
    let closed = false;
    ctx.on("close", () => { closed = true; });
    // Poll: consider "connected" once we've navigated off the login/SSO pages.
    while (Date.now() - start < timeoutMs && !closed) {
      await new Promise((r) => setTimeout(r, 2000));
      let url = "";
      try { url = page.url(); } catch (_) { break; } // page/context gone = user closed it
      if (url && url !== "about:blank" && !LOGIN_RE.test(url) && url !== args.url) {
        const landedUrl = url;
        await ctx.close().catch(() => {});
        return { ok: true, landedUrl };
      }
    }
    await ctx.close().catch(() => {});
    return closed ? { ok: true, reason: "window-closed" } : { ok: false, reason: "timed-out waiting for login" };
  } catch (e) {
    if (ctx) await ctx.close().catch(() => {});
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
}

/**
 * Headless re-scan using the saved session: capture the dashboard's title + visible text + a screenshot
 * as a "what changed" snapshot. Deep per-LMS parsing (new assignments/files) is the next layer; this
 * proves the logged-in session survives and can be read unattended.
 * @param {{ baseDir: string, name: string, url: string, outDir: string }} args
 */
async function scanPortal(args) {
  const pw = tryLoadPlaywright();
  if (!pw) return { ok: false, reason: "playwright-not-installed" };
  const dir = profileDir(args.baseDir, args.name);
  let ctx;
  try {
    ctx = await pw.chromium.launchPersistentContext(dir, { headless: true });
    const page = await ctx.newPage();
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const title = await page.title().catch(() => "");
    const url = page.url();
    if (LOGIN_RE.test(url)) { await ctx.close(); return { ok: false, reason: "session expired — reconnect", needsReconnect: true }; }
    const text = (await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => "")).slice(0, 4000);
    let shot = null;
    try {
      fs.mkdirSync(args.outDir, { recursive: true });
      shot = path.join(args.outDir, `${slug(args.name)}-${Date.now()}.png`);
      await page.screenshot({ path: shot, fullPage: false });
    } catch (_) { shot = null; }
    await ctx.close();
    return { ok: true, title, url, textSnippet: text, screenshot: shot };
  } catch (e) {
    if (ctx) await ctx.close().catch(() => {});
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
}

/**
 * Canvas has a real student REST API — the friendliest path where it's available. Uses a personal access
 * token the student generates (Canvas > Account > Settings > New Access Token). Read-only.
 * @param {{ baseUrl: string, token: string }} args
 */
async function canvasRecent(args) {
  const base = String(args.baseUrl || "").replace(/\/+$/, "");
  if (!base || !args.token) return { ok: false, reason: "need Canvas base URL + access token" };
  try {
    const res = await fetch(`${base}/api/v1/users/self/activity_stream?per_page=20`, {
      headers: { Authorization: `Bearer ${args.token}` },
    });
    if (!res.ok) return { ok: false, reason: `Canvas API ${res.status}` };
    const items = await res.json();
    const events = (Array.isArray(items) ? items : []).map((it) => ({
      type: it.type,
      title: it.title,
      course: it.context_type === "Course" ? it.course_id : null,
      at: it.created_at,
      url: it.html_url,
    }));
    return { ok: true, events };
  } catch (e) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
}

const FILE_RE = /\.(pdf|pptx?|docx?)($|\?)/i;

async function fetchJson(url, headers) {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (e) { return { ok: false, reason: e && e.message ? e.message : String(e) }; }
}

/**
 * Canvas deep sync: list active courses -> their files. Returns file descriptors (with a download URL
 * that carries its own verifier token, so no auth header is needed to fetch the bytes). Read-only.
 * @param {{ baseUrl: string, token: string }} args
 */
async function canvasFiles(args) {
  const base = String(args.baseUrl || "").replace(/\/+$/, "");
  if (!base || !args.token) return { ok: false, reason: "need Canvas base URL + token" };
  const h = { Authorization: `Bearer ${args.token}` };
  const courses = await fetchJson(`${base}/api/v1/courses?enrollment_state=active&per_page=50`, h);
  if (!courses.ok) return { ok: false, reason: `courses: ${courses.reason}` };
  const out = [];
  for (const c of (courses.data || []).slice(0, 20)) {
    const files = await fetchJson(`${base}/api/v1/courses/${c.id}/files?sort=updated_at&order=desc&per_page=30`, h);
    if (!files.ok) continue; // many courses restrict the files API — skip quietly
    for (const f of files.data || []) {
      if (!f.url) continue;
      out.push({ id: `canvas:${f.id}`, name: f.display_name || f.filename || `file-${f.id}`, courseName: c.name, url: f.url, updatedAt: f.updated_at });
    }
  }
  return { ok: true, files: out };
}

/** Download a URL's bytes to dest (for Canvas pre-signed file URLs). */
async function downloadUrl(url, dest, headers) {
  try {
    const res = await fetch(url, { headers: headers || {} });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return { ok: true, path: dest, bytes: buf.length };
  } catch (e) { return { ok: false, reason: e && e.message ? e.message : String(e) }; }
}

/**
 * Browser harvest: using the saved logged-in session, find downloadable lecture files on the portal page
 * and download the ones we haven't seen — all in ONE session pass (authenticated via the shared cookies).
 * @param {{ baseDir: string, name: string, url: string, outDir: string, seenIds?: string[] }} args
 * @returns {Promise<{ ok: boolean, reason?: string, needsReconnect?: boolean, downloaded?: Array<{id,name,path}> }>}
 */
async function harvestBrowserPortal(args) {
  const pw = tryLoadPlaywright();
  if (!pw) return { ok: false, reason: "playwright-not-installed" };
  const seen = new Set(args.seenIds || []);
  const dir = profileDir(args.baseDir, args.name);
  let ctx;
  try {
    ctx = await pw.chromium.launchPersistentContext(dir, { headless: true });
    const page = await ctx.newPage();
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (LOGIN_RE.test(page.url())) { await ctx.close(); return { ok: false, reason: "session expired — reconnect", needsReconnect: true }; }
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => ({ href: a.href, text: (a.textContent || "").trim().slice(0, 90) })));
    const fresh = [];
    const seenHref = new Set();
    for (const l of links) {
      if (!FILE_RE.test(l.href) || seenHref.has(l.href)) continue;
      seenHref.add(l.href);
      const id = `url:${l.href}`;
      if (!seen.has(id)) fresh.push({ id, href: l.href, text: l.text });
    }
    fs.mkdirSync(args.outDir, { recursive: true });
    const downloaded = [];
    for (const f of fresh.slice(0, 20)) {
      try {
        const resp = await ctx.request.get(f.href, { timeout: 30000 });
        if (!resp.ok()) continue;
        const name = safeName(f.text, f.href);
        const dest = path.join(args.outDir, name);
        fs.writeFileSync(dest, await resp.body());
        downloaded.push({ id: f.id, name, path: dest });
      } catch (_) { /* skip a single bad link, keep going */ }
    }
    await ctx.close();
    return { ok: true, downloaded };
  } catch (e) {
    if (ctx) await ctx.close().catch(() => {});
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
}

function safeName(text, href) {
  let base = "";
  try { base = path.basename(new URL(href).pathname); } catch (_) { /* ignore */ }
  const ext = (href.match(FILE_RE) || [""])[0].replace(/\?.*$/, "") || path.extname(base) || ".pdf";
  const stem = slug(text || base || "lecture");
  return `${stem}${ext.startsWith(".") ? ext : "." + ext}`.replace(/\.+$/, "").slice(0, 80) || "lecture.pdf";
}

module.exports = { isAvailable, connectPortal, scanPortal, canvasRecent, canvasFiles, downloadUrl, harvestBrowserPortal };
