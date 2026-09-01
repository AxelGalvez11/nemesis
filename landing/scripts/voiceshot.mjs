// Capture the REAL composer mid voice-conversation from /dev-preview/learn — the
// pair behind the landing page's Voice band (public/nemesis/shots/voice-*.webp).
//
// The SpeechRecognition stub is the fixture: the SAME composer the Canvas mounts,
// fed a hand-written spec, with no model and no microphone deciding anything —
// the same doctrine as the See-band figures (see FIGURES in Features.tsx). The
// session, the live italic bar, the stop pill and the glow are all the product's
// own code running; only the recogniser is scripted, word by word, which also
// keeps the product's real silence timer from auto-sending mid-shot.
//
// To re-capture after a composer change:
//   run apps/web (npx next dev -p 3269), then from this directory:
//   node voiceshot.mjs http://localhost:3269 /tmp
//   magick /tmp/voice-light.png -define webp:method=6 -quality 90 ../public/nemesis/shots/voice-light.webp
//   magick /tmp/voice-dark.png  -define webp:method=6 -quality 90 ../public/nemesis/shots/voice-dark.webp
// (playwright resolves from the repo root's node_modules.)
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3269";
const OUT = process.argv[3] ?? ".";
const WORDS =
  "so the spike happens because sodium rushes in and then potassium brings the charge back down";

const stub = `
  class FakeRec {
    constructor() { this.continuous=false; this.interimResults=false; this.lang="";
      this.onresult=null; this.onerror=null; this.onend=null; }
    start() { window.__recActive = this; }
    stop() { if (this === window.__recActive) window.__recActive = null; }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeRec;
  window.__speak = (words) => {
    const r = window.__recActive;
    if (!r || !r.onresult) return false;
    r.onresult({ results: [ { isFinal: false, 0: { transcript: words } } ] });
    return true;
  };
`;

const browser = await chromium.launch();
// Warm the route once so neither captured run races the dev compile.
{
  const warm = await browser.newPage();
  await warm.goto(`${BASE}/dev-preview/learn?seed=lesson`, { waitUntil: "networkidle" });
  await warm.close();
}
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1456, height: 1140 } });
  await page.emulateMedia({ colorScheme: scheme });
  await page.addInitScript(stub);
  await page.goto(`${BASE}/dev-preview/learn?seed=lesson`, { waitUntil: "networkidle" });
  const bars = page.locator('button[aria-label="Start a voice conversation"]');
  await bars.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(800);
  const parts = WORDS.split(" ");
  let spoken = false;
  for (let attempt = 0; attempt < 3 && !spoken; attempt++) {
    await bars.click();
    // The live bar says "Listening…" once the session is really hearing.
    try {
      await page.waitForFunction(
        () => (document.querySelector("#canvas-composer")?.textContent ?? "").includes("Listening"),
        { timeout: 2500 },
      );
    } catch {
      const stop = page.locator('button[aria-label="End the voice conversation"]');
      if (await stop.count()) await stop.first().click();
      await page.waitForTimeout(500);
      continue;
    }
    // Words grow as they are heard; each growth resets the product's silence
    // timer, so the session stays mid-listen for as long as we keep talking.
    for (let i = 1; i <= parts.length; i++) {
      await page.evaluate((w) => window.__speak(w), parts.slice(0, i).join(" "));
      await page.waitForTimeout(110);
    }
    spoken = (await page.evaluate(() => document.querySelector("#canvas-composer")?.textContent ?? "")).includes("down");
  }
  if (!spoken) throw new Error(`${scheme}: the words never reached the bar`);
  await page.waitForTimeout(350);
  const pill = await page.locator("#canvas-composer").boundingBox()
    ?? await page.locator('div[class*="rounded-[var(--composer-radius)]"]').first().boundingBox();
  if (!pill) throw new Error("composer not found");
  // Anchored so both schemes crop identically once the words wrap to two lines:
  // room above for the character, and below only what exists — the pill floats
  // near the viewport's bottom edge, so the glow's bloom gets ~28px there.
  const clip = {
    x: Math.max(0, pill.x - 72),
    y: Math.max(0, pill.y - 96),
    width: Math.min(1456, pill.width + 144),
    height: pill.height + 96 + 16,
  };
  if (clip.y + clip.height > 1139) throw new Error(`${scheme}: clip runs past the viewport`);
  await page.screenshot({ path: `${OUT}/voice-${scheme}.png`, clip });
  const state = await page.evaluate(() => ({
    listening: document.body.innerText.includes("Listening") || null,
    stop: !!document.querySelector('button[aria-label="End the voice conversation"]'),
    barText: document.querySelector("#canvas-composer")?.innerText.slice(0, 120) ?? null,
  }));
  console.log(scheme, JSON.stringify(state), JSON.stringify(clip));
  await page.close();
}
await browser.close();
console.log("done");
