// The one place the phone decides what happens when a learner taps an address.
//
// 🔴 WHY THIS MODULE EXISTS (owner 2026-08-21): "instead of taking the user to safari, can the app
// do a mini viewer?" — asked immediately after tapping a row in the Sources drawer and being thrown
// out of Nemesis into Safari. Every tap on a source used to be `Linking.openURL`, which hands the
// address to the OS: the app is backgrounded, the drawer is gone, and coming back is a trip through
// the app switcher. `WebBrowser.openBrowserAsync` presents `SFSafariViewController` INSTEAD — a
// sheet over Nemesis with a Done button, the real Safari engine, the learner's cookies and Reader —
// and dismissing it puts them back on the exact screen, with the drawer still open. That is the
// "mini viewer".
//
// 🔴 NO NEW PACKAGE AND NO NATIVE REBUILD. `expo-web-browser` (~56.0.6) was already a dependency
// and is already used in anger — `auth/AuthProvider.tsx:12` imports it and `:193` runs
// `openAuthSessionAsync` for every social sign-in. This module reaches for the sibling entry point
// on the same already-linked native module.
//
// 🔴 THE DRAWER WAS WHERE THE OWNER WAS STANDING; THE CHIPS ARE WHERE THE TAPS ARE. The report came
// from `SourcesSheet`, but a well-cited answer carries a dozen inline citation chips inside its
// sentences (`MessageBody`'s `InlineLink`), and those are both the commoner tap and the more
// jarring exit — mid-sentence, straight out of the app. Fixing the drawer alone would have answered
// the report and not the complaint, so every call site in prose, sheets and notes routes here.
//
// 🔴 AND THIS IS WHY THE OPENER BRANCHES ON SCHEME RATHER THAN JUST CALLING THE VIEWER. An in-app
// web view cannot open a mail composer or a dialler. That is not a guess about iOS, it is in the
// module's own vendored source — `node_modules/expo-web-browser/ios/WebBrowserModule.swift`:
//
//     private func isValid(url: URL) -> Bool {
//       return url.scheme == "http" || url.scheme == "https"
//     }
//     ...
//     guard self.isValid(url: url) else { throw WebBrowserInvalidURLException() }
//
// So a `mailto:` handed to `openBrowserAsync` REJECTS; it does not degrade. `settings.tsx:145`
// ("Contact support") opens `mailto:${SUPPORT_EMAIL}` and is deliberately NOT routed through this
// module — it has no need of a branch it would always take the same way — but `note.tsx` DOES need
// the branch, because its own gate is `isExternalUrl` (`lib/wikilinks.ts:61`), which matches
// `/^(https?|mailto|tel):/i`. A `mailto:` link written inside a note reaches this function.

import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

import { hostOf } from "../components/canvas/canvas-sources.ts";
import type { ThemeColors } from "../theme/palette.ts";

/**
 * Where a tapped address has to go.
 *
 * `"none"` is not an error state — it is an address with nothing in it, which every caller used to
 * spell as its own `if (url)` guard.
 */
export type LinkRoute = "viewer" | "system" | "none";

/**
 * Schemes that are refused outright rather than handed on to the OS.
 *
 * 🔴 A DENYLIST, AND IT IS THE ONE THING IN THIS FILE THAT IS NOT "keep today's behaviour"
 * (owner 2026-08-21, after a review). The paragraph above `linkRoute` argued these two were safe to
 * pass through, on the grounds that (a) it is exactly what every call site did before this module
 * existed, and (b) the OS has no handler for either, so the tap dies at the boundary. Both of those
 * are TRUE and neither is the point.
 *   THE POINT IS WHOSE TEXT THIS IS. Every address that reaches this function on the answer
 * surfaces was written by a MODEL, out of web pages it just read. `canvas-sources.ts` says what
 * that makes a `javascript:` or `data:` href in as many words — "not a source, it is an
 * instruction" — and `packages/shared/src/untrusted-content.ts` exists for the same boundary. An
 * address of that shape in an answer is not a link a learner asked to follow; it is content that
 * came back from somewhere. Handing it to the OS and relying on the OS to have no handler is
 * relying on a third party's configuration to be the safety property. Refusing it here makes the
 * refusal ours.
 *   AND IT IS NOT THE "third opinion about URLs" THAT WAS RIGHTLY REJECTED. That objection was
 * about re-deriving what counts as an openable WEB address, which `hostOf` already owns and still
 * owns — every http(s) verdict below is still entirely its call. This adds nothing to that
 * judgement; it removes two named schemes from the fallback, which no future feature will register
 * and which nothing in this app has ever emitted. A custom scheme a later feature does register —
 * `wikilink:`, `nemesis:`, anything — is untouched and still reaches `Linking.openURL`.
 */
const REFUSED_SCHEMES = ["javascript:", "data:", "file:", "blob:"];

/**
 * The whole decision, pure and separately testable. See `open-link.test.ts`.
 *
 * 🔴 THE JUDGEMENT IS `hostOf`, AND DELIBERATELY NOT A FOURTH COPY OF IT (owner 2026-08-21). This
 * repo already holds exactly two spellings of "is this an openable web address", and the header of
 * `components/canvas/canvas-sources.ts` explains what the rule is FOR: a `javascript:` or `data:`
 * href "is not a source, it is an instruction". Which of the two belongs here:
 *
 *   * `hostOf` (components/canvas/canvas-sources.ts) — CHOSEN. It is the one the rendering layer
 *     already agrees with, which matters more than it sounds: `sourcePills` filters every drawer
 *     row through it, and `MessageBody:230`/`:330` decide what becomes a citation chip with it. So
 *     the set of addresses that can be DRAWN as a source and the set that can reach the viewer are
 *     the same set by construction, not by two functions happening to agree today.
 *   * `linkUrl` (api/canvases.ts:777) — REJECTED. It is the same rule, duplicated on purpose: its
 *     own comment records that `api/` must not depend on `components/`. Importing it here would
 *     pull the entire canvases store — Supabase client and all — into every screen that renders a
 *     link, to reuse nine lines.
 *
 * `lib/` importing `components/` is allowed and has precedent: `lib/nav-destinations.ts:18` takes
 * its icons from `@/components/icons`.
 *
 * 🔴 ANYTHING THAT IS NOT http(s) KEEPS TODAY'S BEHAVIOUR EXACTLY — it goes to `Linking.openURL`,
 * which is what every one of these call sites did before this module existed. That covers
 * `mailto:`, `tel:`, our own `wikilink:` scheme, and a bare relative note path like `Some Note.md`.
 * It does NOT cover `javascript:`, `data:`, `file:` or `blob:` — those are refused outright and go
 * nowhere at all. See `REFUSED_SCHEMES` below, which records why that reverses the first draft of
 * this very paragraph.
 */
export function linkRoute(url: string): LinkRoute {
  const target = url.trim();
  if (!target) return "none";
  // Lower-cased because a scheme is case-insensitive and "JavaScript:alert(1)" is the same address
  // as "javascript:alert(1)" — the review that found this passed exactly that string.
  const lowered = target.toLowerCase();
  if (REFUSED_SCHEMES.some((scheme) => lowered.startsWith(scheme))) return "none";
  return hostOf(target) === null ? "system" : "viewer";
}

/**
 * The viewer's chrome, in Nemesis's own colours.
 *
 * 🔴 THE COLOURS ARE THE APP'S, NOT THE SYSTEM'S — AND THAT IS ALREADY SETTLED BEFORE THEY ARRIVE
 * (owner 2026-08-21). `ThemeProvider.tsx:86` is the authority: it turns the student's STORED
 * preference into a `ResolvedMode` (only the "system" preference consults `useColorScheme()` at
 * all) and builds the palette with `buildColors(resolvedMode, accent)`. `ThemeColors` is therefore
 * a total function of `resolvedMode`, so a caller passing `useTheme().colors` has already followed
 * the app's own light/dark setting and there is nothing left for this function to branch on.
 * REJECTED: reading `useColorScheme()` / `Appearance.getColorScheme()` in here. That is the SYSTEM
 * setting, so a phone in system-light with Nemesis pinned to dark would open a white bar over a
 * black app — the precise mismatch this task exists to remove — and it would be a second authority
 * on a question the provider already answers.
 *
 * 🔴 ONLY SIX OF THESE FIELDS DO ANYTHING ON iOS, AND THE VENDORED SOURCE SAYS WHICH.
 * `ios/WebBrowserOptions.swift` declares exactly `readerMode`, `enableBarCollapsing`,
 * `dismissButtonStyle`, `toolbarColor`, `controlsColor`, `presentationStyle`; the rest of
 * `WebBrowserOpenOptions` is Android/web. `ios/WebBrowserSession.swift` then maps
 * `toolbarColor -> preferredBarTintColor` and `controlsColor -> preferredControlTintColor`. The
 * Android fields below are marked as such and are inert on the phone we ship.
 */
export function viewerOptions(colors: ThemeColors): WebBrowser.WebBrowserOpenOptions {
  return {
    // The bar is the app's page colour: #000000 in dark (the OLED mandate on `DARK_BASE.bg`),
    // #ffffff in light. iOS picks its own bar-text colour from this tint's luminance.
    toolbarColor: colors.bg,
    // 🔴 THE DONE BUTTON IS THE STUDENT'S ACCENT, AND IT IS LEGIBLE BY CONSTRUCTION. The accent is
    // contrast-guarded against `bg` in `palette.ts` (`accentFamily` runs `ensureContrast(..., bg,
    // MIN_ACCENT_CONTRAST)`) and the bar tint above IS `bg`, so the guarantee transfers verbatim.
    // The one family that skips `ensureContrast` is Default, which is pinned rather than
    // synthesized — so it was measured instead. All 14 combinations (7 accents x 2 modes) through
    // this file's own `contrastRatio`, 2026-08-21: worst is light/Pink #ee1b8c on #ffffff at
    // 4.061:1, then dark/Default #6e6e6e on #000000 at 4.119:1; best is dark/Green at 14.909:1.
    // Every one clears the 3.5:1 accent floor, and WCAG's 3:1 for UI controls, with room to spare.
    controlsColor: colors.accent,
    // 🔴 A SHEET, NOT A TAKEOVER (owner said "mini viewer"). The module's default is
    // `OVER_FULL_SCREEN` — Safari swallows the screen, which is visually the same event the owner
    // complained about even though the app is still underneath. `PAGE_SHEET` leaves Nemesis
    // visible above the card and adds swipe-down-to-dismiss, which is the idiom every other panel
    // on this phone already uses (`SlideUpSheet`, nineteen call sites). Dismissal by swipe is
    // handled: `WebBrowserSession` implements `presentationControllerDidDismiss` and resolves
    // `{ type: "cancel" }`, the same as pressing Done.
    // REJECTED: `FORM_SHEET` (an iPad style; `app.json` sets `ios.supportsTablet: false`, so on
    // iPhone it degrades to a full-screen present and buys nothing).
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    dismissButtonStyle: "done",
    // 🔴 EXPLICITLY OFF, AND IT IS THE MODULE DEFAULT — spelled out so nobody "improves" it.
    // A collapsing bar buys a few points of reading height and takes the Done button off screen
    // while the learner scrolls. On a surface whose entire purpose is being easy to back out of,
    // the way out must not be the thing that hides.
    enableBarCollapsing: false,
    // Also the default. Reader is available to the learner from the address bar when the page
    // supports it; FORCING it would strip the figures and tables out of exactly the papers this
    // app cites.
    readerMode: false,
    // --- Android (Custom Tabs). Inert on iOS; `app.json` declares the platform, so they are set. --
    secondaryToolbarColor: colors.surface,
    showTitle: true,
  };
}

/**
 * Open an address the way this app opens addresses. Never rejects; safe to `void`.
 *
 * 🔴 A `locked` RESULT IS NOT A FAILURE AND MUST NOT FALL BACK (owner 2026-08-21). This is the trap
 * in this file. `ios/WebBrowserModule.swift` does NOT throw when a viewer is already on screen — it
 * RESOLVES:
 *
 *     guard self.currentWebBrowserSession == nil else {
 *       promise.resolve(["type": "locked"])
 *       return
 *     }
 *
 * and that guard is reachable in ordinary use: a double-tap on a citation chip lands the second tap
 * inside the first one's presentation animation. Treating a resolved result as "the viewer didn't
 * work" would then hand the SAME url to `Linking.openURL` and throw the learner out to Safari — the
 * exact bug this module exists to remove, fired by an impatient finger. So the fallback hangs off
 * `catch`, never off the result: every `WebBrowserResultType` (`cancel`, `dismiss`, `opened`,
 * `locked`) means the viewer took the address.
 *
 * 🔴 BUT A THROW MUST FALL BACK, NOT BE SWALLOWED. A source that does nothing when tapped is worse
 * than one that opens in Safari. `openBrowserAsync` throws when the native module is missing
 * (`UnavailabilityError`, thrown in `build/WebBrowser.js:119`), when the URL is not http(s)
 * (`WebBrowserInvalidURLException` — `linkRoute` makes that unreachable, and it stays caught
 * anyway), and on Android when no browser can handle the intent. In every one of those the address
 * is still perfectly good; it just needs the OS. Only if `Linking.openURL` ALSO fails is the tap
 * dropped, and at that point there is nothing left to try.
 */
export async function openLink(url: string, colors: ThemeColors): Promise<void> {
  // 🔴 TRIMMED ONCE, HERE, AND THE TRIMMED FORM IS WHAT TRAVELS. `hostOf` trims before parsing, so
  // " https://x.test " is judged openable — but the native side coerces the raw string with
  // Swift's `URL(string:)`, which does not, and the surrounding whitespace would turn a verdict of
  // "viewer" into a rejection. Passing the trimmed value keeps the thing we judged and the thing we
  // open identical. `Linking.openURL` gets the same treatment, which is a small improvement on the
  // old call sites rather than a change of behaviour.
  const target = url.trim();
  const route = linkRoute(target);
  if (route === "none") return;

  if (route === "viewer") {
    try {
      await WebBrowser.openBrowserAsync(target, viewerOptions(colors));
      return;
    } catch {
      // Fall through: the viewer could not present, so the OS gets its turn. See the doc above for
      // why this is `catch` and not a test on the resolved result.
    }
  }

  try {
    await Linking.openURL(target);
  } catch {
    // Nothing above this. Swallowed exactly as the call sites this replaced already did.
  }
}
