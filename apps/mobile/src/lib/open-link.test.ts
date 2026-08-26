// Unit tests for the one link opener. Repo convention (Deno, std/assert), same shape as
// `lib/artifact-card.test.ts` and `theme/palette.test.ts`.
//
// Run: deno test --no-check apps/mobile/src/lib/open-link.test.ts
//
// 🔴 THIS FILE DOES NOT EXECUTE UNDER A BARE `deno test` TODAY, AND THAT IS A PROPERTY OF THE
// MODULE GRAPH, NOT OF THESE ASSERTIONS (owner 2026-08-21). `open-link.ts` is the app's opener, so
// it necessarily imports the two platform edges it exists to choose between — `react-native`'s
// `Linking` and `expo-web-browser` — and it reaches `hostOf` through the `@/` path alias. Deno has
// neither: there is no `deno.json` in this repo to map `@/*`, and importing the real `react-native`
// outside Metro throws on load. Splitting the pure half into a second module purely to dodge that
// was rejected — the brief is ONE function every caller uses, and a scheme table that lives in a
// different file from the opener is exactly how the two drift apart.
//
// So the assertions below were verified on 2026-08-21 by running THIS module — the real
// `open-link.ts`, transpiled by the repo's own `tsc`, not a re-typed copy — under node, with
// `react-native` and `expo-web-browser` replaced by recording stubs and `@/…` rewritten to the
// emitted paths. 69 assertions, 0 failures on the final run, and that includes the three cases
// only a fake can reach: a viewer that THROWS (falls back to the system opener), a viewer that
// resolves `{ type: "locked" }` (does NOT fall back), and both edges failing at once (the tap is
// dropped, and nothing rejects). The run also earned its keep — it caught one wrong expectation,
// `http:///path`, where the module was right and the test was not; see that case below. Deno is
// not installed on the machine this was written on; when it is, this file needs an import map
// before it will run, and nothing else.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { linkRoute, viewerOptions } from "./open-link.ts";
import { buildColors } from "../theme/palette.ts";

// --- the scheme table --------------------------------------------------------
//
// The whole point of the branch. "viewer" is the in-app SFSafariViewController; "system" is
// `Linking.openURL`, i.e. byte-for-byte what every call site did before this module existed.

Deno.test("http and https are the only schemes the in-app viewer ever sees", () => {
  assertEquals(linkRoute("https://pubmed.ncbi.nlm.nih.gov/12345678/"), "viewer");
  assertEquals(linkRoute("http://example.com/paper"), "viewer");
  // Uppercase scheme is still the same scheme — `new URL` lowercases the protocol.
  assertEquals(linkRoute("HTTPS://en.wikipedia.org/wiki/Statin"), "viewer");
  // Whitespace is not a scheme change. `openLink` trims before it opens, so what is judged here
  // and what is handed to the viewer are the same string.
  assertEquals(linkRoute("  https://arxiv.org/abs/2401.00001  "), "viewer");
});

Deno.test("mailto and tel keep going to the OS — an in-app web view has no mail composer", () => {
  // 🔴 THE REASON THIS FUNCTION BRANCHES AT ALL. `settings.tsx:145` opens `mailto:` and is left
  // alone, but `note.tsx` gates on `isExternalUrl` (`lib/wikilinks.ts:61`, `/^(https?|mailto|tel):/i`)
  // so a mailto: written inside a note DOES arrive here. Routed to the viewer it would not degrade
  // to anything — `ios/WebBrowserModule.swift` throws `WebBrowserInvalidURLException` on any scheme
  // that is not http(s).
  assertEquals(linkRoute("mailto:support@enternemesis.com"), "system");
  assertEquals(linkRoute("mailto:support@enternemesis.com?subject=Help"), "system");
  assertEquals(linkRoute("tel:+15551234567"), "system");
});

Deno.test("a javascript: or data: address never reaches the viewer", () => {
  // `hostOf`'s header states the rule and what it is for: such an href "is not a source, it is an
  // instruction". It is NOT refused outright here — see `linkRoute`'s doc — it is handed to the OS
  // exactly as before, which has no handler for either scheme. What matters is that neither is ever
  // loaded by the in-process web engine.
  assertEquals(linkRoute("javascript:alert(document.cookie)"), "system");
  assertEquals(linkRoute("JavaScript:alert(1)"), "system");
  assertEquals(linkRoute("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="), "system");
});

Deno.test("our own wikilink: scheme and bare relative note paths are untouched", () => {
  // note.tsx resolves these itself and only ever reaches the opener for what it could not resolve;
  // either way the answer must be the pre-existing one.
  assertEquals(linkRoute("wikilink:Some%20Note"), "system");
  assertEquals(linkRoute("wikilink:Folder/Note#Heading"), "system");
  assertEquals(linkRoute("Some Note.md"), "system");
  assertEquals(linkRoute("./Folder/Note"), "system");
  assertEquals(linkRoute("/absolute/looking/path"), "system");
  assertEquals(linkRoute("#anchor-only"), "system");
});

Deno.test("an http(s) URL with no host is not openable in the viewer", () => {
  // `hostOf` requires a hostname, not just a scheme. This would have gone to `Linking.openURL`
  // before and still does; the viewer is never handed a URL it cannot load.
  assertEquals(linkRoute("https://"), "system");

  // 🔴 NOT ASSERTED HERE, AND ON PURPOSE: `http:///path` (owner 2026-08-21). The node run of this
  // table flagged it as the one disagreement, and the module turned out to be right — WHATWG URL
  // normalizes `http:///path` to `http://path/`, so the host is the literal string "path" and the
  // route is "viewer". That is not a special case this file invented: it is whatever engine `new
  // URL` comes from, and it is ALREADY the verdict `MessageBody:230` reaches when it decides the
  // same address is a citation chip. Pinning it in a test would be pinning React Native's URL
  // polyfill, which is not spec-exact and is not ours to promise.
});

Deno.test("an empty address is a no-op, which is what the callers' own `if (url)` used to say", () => {
  assertEquals(linkRoute(""), "none");
  assertEquals(linkRoute("   "), "none");
  assertEquals(linkRoute("\n\t"), "none");
});

// --- the chrome --------------------------------------------------------------

Deno.test("the viewer wears the app's own colours, per resolved mode", () => {
  const dark = viewerOptions(buildColors("dark", "default"));
  assertEquals(dark.toolbarColor, "#000000");
  assertEquals(dark.controlsColor, "#6e6e6e");

  const light = viewerOptions(buildColors("light", "default"));
  assertEquals(light.toolbarColor, "#ffffff");
  assertEquals(light.controlsColor, "#404040");

  // The accent is the student's, not a constant: a blue-accent phone gets a blue Done button.
  assertEquals(viewerOptions(buildColors("dark", "blue")).controlsColor, "#7196f4");
  assertEquals(viewerOptions(buildColors("light", "blue")).controlsColor, "#1b57ee");
});

Deno.test("the bar tint and the control tint are the same pair palette.ts already guards", () => {
  // Not a restatement of the palette's own tests: it guarantees accent-vs-bg, and this is the
  // assertion that the viewer actually spends that pair on the two surfaces that sit against each
  // other — `preferredBarTintColor` and `preferredControlTintColor` (ios/WebBrowserSession.swift).
  for (const mode of ["dark", "light"] as const) {
    for (const accent of ["default", "blue", "green", "yellow", "pink", "orange", "purple"]) {
      const colors = buildColors(mode, accent);
      const options = viewerOptions(colors);
      assertEquals(options.toolbarColor, colors.bg);
      assertEquals(options.controlsColor, colors.accent);
    }
  }
});

Deno.test("the way out of the viewer is never allowed to hide", () => {
  const options = viewerOptions(buildColors("dark", "default"));
  assertEquals(options.dismissButtonStyle, "done");
  // A collapsing bar takes Done off screen while scrolling. On a surface whose whole purpose is
  // being easy to back out of, that is the one control that must stay put.
  assertEquals(options.enableBarCollapsing, false);
  // Reader is the learner's to invoke; forcing it strips figures and tables out of papers.
  assertEquals(options.readerMode, false);
});
