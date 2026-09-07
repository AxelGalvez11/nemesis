import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

// ── the chat, one for one with ChatGPT Work (2026-09-06) ─────────────────────────────────────
//
// Owner: *"the nemesis chat still doesnt match chatgpt work … make it perfect one to one okay?
// exclude the 'share' and three dots icon button"*, *"thinking preview style and behavior, panel,
// everything pretty much"*, *"pay attention to how it asks user questions too"*. Every number here
// was read off his signed-in Chrome and is written up in docs/chatgpt-work-chat-reference.md; his
// four answers (Files + Web search; nothing in the model slot; questions without a countdown; the
// pane keeps its tabs and follows the desktop app's annotation feature) are pinned where they bite.

const strip = (text: string) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(new URL(rel, import.meta.url), "utf8"));

const PANEL = read("./work-panel.tsx");
const CONTROLS = read("./canvas-controls.tsx");
const HEADER = read("./canvas-header.tsx");
const SURFACE = read("./canvas-surface.tsx");
const CANVAS = read("./learning-canvas.tsx");
const PREVIEW = read("./canvas-thinking-preview.tsx");
const SUMMARY = read("./canvas-thinking-summary.tsx");
const QUESTION = read("./canvas-clarification.tsx");
const COMPOSER = read("./canvas-composer.tsx");
const TURN = read("./canvas-thread-turn.tsx");
const ACTIONS = read("./reply-actions.tsx");
const TABS = read("./dock-tabs.tsx");
const DOCK = read("./dock-panel.tsx");
const CSS = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
const CHROME_CSS = readFileSync(new URL("../../../app/styles/desktop-chrome.css", import.meta.url), "utf8");
const MARKDOWN = read("../../../lib/workspace/chat-markdown.tsx");

test("🔴🔴 the Outputs/Sources card is ChatGPT Work's rail: 300 wide, radius 24, 31 in and 52 down, standing until its toggle is pressed", () => {
  assert.match(PANEL, /export const WORK_PANEL_WIDTH = 300;/);
  assert.match(PANEL, /export const WORK_PANEL_INSET = WORK_PANEL_WIDTH \+ 31;/);
  assert.match(PANEL, /fixed right-\[31px\] top-\[52px\] z-40 max-h-\[calc\(100svh-84px\)\] overflow-y-auto rounded-\[24px\]/, "the card left the reference's place or shape");
  assert.match(PANEL, /shadow-\[0_4px_16px_rgba\(0,0,0,0\.05\)\] ring-1 ring-\(--ui-stroke-tertiary\)/, "the card lost its hairline and soft shadow");
  assert.match(PANEL, /createPortal\(/, "the card is inside the header's transform again, so `fixed` is not fixed");
  assert.match(PANEL, /data-workspace=""/, "the portal left the theme scope; its buttons will paint raw");
  assert.ok(!/useDismiss/.test(PANEL), "the card closes on an outside click; theirs stands");
  assert.match(CONTROLS, /aria-label="Files and sources"/, "the header toggle lost the reference's name");
  assert.match(CONTROLS, /aria-pressed=\{open\}/, "the toggle does not say whether the card stands");
  assert.ok(!/<ReaderToggle/.test(HEADER), "the reading-pane door is back; ChatGPT's header has only the toggle");
  assert.ok(!/aria-label="Share"|aria-label="More"/.test(HEADER + CONTROLS), "Share or ⋯ came back, which the owner excluded");
});

test("🔴🔴 the thread re-centres beside the card and the header does not move", () => {
  assert.match(SURFACE, /workInset\?: number;/);
  assert.match(SURFACE, /data-canvas-work-inset=\{workInset > 0 \? "" : undefined\}/, "the inner wrapper is gone, so the header narrows with the thread");
  assert.match(SURFACE, /width: `calc\(100% - \$\{workInset\}px\)`/);
  assert.match(CANVAS, /workInset=\{workPanelOpen && dock\.items\.length === 0 \? WORK_PANEL_INSET : 0\}/, "the card no longer stands down for the docked reader");
  assert.match(CANVAS, /useEffect\(\(\) => setWorkPanelOpen\(readWorkPanelOpen\(\)\), \[\]\);/, "the card's state is not remembered");
});

test("🔴🔴 Sources lists files and Web search, nothing else (owner's answer, 2026-09-06)", () => {
  assert.match(PANEL, /Web search/);
  assert.match(PANEL, /onWebSearch/);
  assert.ok(!/Gmail|Memory|connected app/i.test(PANEL), "connected apps or Memory rows are back");
  assert.match(CANVAS, /onWebSearch=\{\(\) => setCapability\(capability === "search" \? null : "search"\)\}/, "the Web search row is a standing switch, or does nothing");
});

test("🔴🔴 the composer's model slot holds nothing (owner's answer), and the disclaimer stands over it", () => {
  assert.ok(!/GPT-|model picker|ModelPicker/.test(COMPOSER), "a model picker appeared in the composer");
  assert.match(COMPOSER, /Nemesis can make mistakes\. Check important info\./, "the line over the composer is gone");
  assert.match(COMPOSER, /\{intent\.kind !== "start" && \(/, "the line shows on the front door too");
});

test("🔴🔴 thinking: a clock over a hairline, the settled lines, the running step; finished, a Worked-for button that opens the log", () => {
  assert.match(PREVIEW, /workingForLabel\(seconds\)/, "the live clock is gone");
  assert.match(PREVIEW, /border-b border-\(--ui-stroke-secondary\) pb-\[8px\]/, "the hairline under the clock is gone");
  assert.match(PREVIEW, /settled\.map\(\(line\) => \(/, "lines already shown vanish when the next one comes");
  assert.ok(!/setInterval/.test(PREVIEW), "a timer walks the caption (canvas-motion.test.ts)");
  assert.ok(existsSync(new URL("./use-turn-clock.ts", import.meta.url)), "the clock hook is gone");
  assert.match(SUMMARY, /gap-\[4px\] text-\[length:var\(--canvas-text-body\)\] leading-\[20px\] text-\(--ui-text-tertiary\)/, "the Worked-for button left the reference's type");
  assert.match(SUMMARY, /name=\{open \? "chevron-down" : "chevron-right"\} size=\{16\}/, "the chevron is not theirs");
  assert.match(SUMMARY, /<div className="border-b border-\(--ui-stroke-secondary\) pb-\[8px\]">/, "the hairline under Worked-for is gone");
  assert.match(CANVAS, /lines=\{session\.milestones\} startedAt=\{session\.turnClock\}/, "the preview is not handed the lines and the clock");
});

test("🔴🔴 a question is asked in the composer: numbered rows, the field as the last row, Skip, and no countdown (owner's answer)", () => {
  assert.match(COMPOSER, /<CanvasClarification onAnswer=\{onClarify\} onDismiss=\{onDismissClarify \?\? \(\(\) => undefined\)\} question=\{intent\.question\} \/>/, "the question is not drawn in the composer");
  assert.match(COMPOSER, /<QuestionNumber n=\{intent\.question\.options\.length \+ 1\} \/>/, "the field's row has no number");
  assert.match(COMPOSER, /data-question-skip=""/, "there is no Skip");
  assert.match(COMPOSER, /dictation\.supported && intent\.kind !== "clarify" && \(/, "the mic shows on the question row");
  assert.match(QUESTION, /className="flex h-\[46px\] w-full items-center gap-\[16px\] rounded-\[23px\]/, "an option row left the reference's 46px");
  assert.match(QUESTION, /size-\[32px\] shrink-0 items-center justify-center rounded-full/, "the number chip left the reference's 32px circle");
  assert.ok(!/setInterval|setTimeout|countdown/i.test(QUESTION), "a countdown is back; the owner chose none");
  assert.ok(!/<CanvasClarification/.test(CANVAS), "the question is drawn in the thread again");
  assert.match(CANVAS, /session\.clarifying && presence !== "preparing" && <CanvasQuestionRows \/>/, "the thread does not show the two waiting rows");
  assert.match(PREVIEW, /Asking question/);
  assert.match(PREVIEW, /Waiting for your answer/);
  assert.match(CANVAS, /onSkipClarify=\{\(\) => void answerClarification\("Use your judgment"\)\}/, "Skip does not hand the turn back to Nemesis");
});

test("🔴 turns: a 40px hover row with Copy under the learner's words, ChatGPT's action strip, date lines, a 24px gap", () => {
  assert.match(TURN, /group\/turn mx-auto w-full max-w-\(--canvas-column\) px-6/);
  assert.match(TURN, /flex h-\[40px\] items-center justify-end opacity-0 transition-opacity focus-within:opacity-100 group-hover\/turn:opacity-100/, "the row under the bubble is gone or always visible");
  assert.match(TURN, /aria-label=\{copied \? "Copied" : "Copy message"\}/);
  assert.match(ACTIONS, /-ml-\[10px\] -mt-\[4px\] flex w-full min-w-0 items-center gap-0 p-\[4px\]/);
  assert.ok(!/\{since && <span/.test(ACTIONS), "the time stamp is back on the action row; theirs has none");
  assert.match(CANVAS, /dateSeparator\(thread\[index - 1\]\?\.at \?\? null, turn\.at\)/, "no date line between turns");
  assert.match(CANVAS, /<div className="flex flex-col gap-6 pb-10" data-canvas-thread="">/, "the turn gap is not the reference's");
});

test("🔴 a scroll-to-bottom button at the column's centre, only while the thread is scrolled up", () => {
  assert.match(CANVAS, /aria-label="Scroll to bottom"/);
  assert.match(CANVAS, /size-\[34px\] -translate-x-1\/2 items-center justify-center rounded-full/, "the button left the reference's 34px circle");
  assert.match(CANVAS, /node\.scrollHeight - node\.scrollTop - node\.clientHeight > 120/, "the button does not read the scroller");
  assert.match(CANVAS, /\{showComposer && awayFromEnd && \(/, "the button shows while at the end");
});

test("🔴🔴 the pane is ONE row: tabs, the `+`, then the tools, and the tabs fade where they meet them", () => {
  // Owner 2026-09-06, with the desktop app open: *"the desktop app has one top row with tabs and the
  // tools, as tabs grow, they fade out if they hit the tools"*, and, with a screenshot of their
  // two-row pane, *"this but with one row up top"*. The fade is theirs, read out of their bundle
  // (`app-initial-*.css`, `.horizontal-scroll-fade-mask`) rather than approximated.
  assert.match(DOCK, /<div className=\{CHROME\.row\} data-testid="dock-panel-row">/, "the pane grew a second row");
  assert.match(DOCK, /<div className="flex min-w-0 flex-1 items-center">\{tabs\}<\/div>/);
  assert.match(DOCK, /<div className="flex shrink-0 items-center">\{controls\}<\/div>/, "the tools left the tab row");
  assert.match(TABS, /horizontal-scroll-fade-mask/, "the strip lost the reference's fade");
  assert.match(TABS, /overflow-x-auto/, "the tabs shrink past legibility instead of scrolling under the fade");
  // The `+` stands still beside the tools; inside the scroller it slides out of reach.
  const strip = TABS.slice(TABS.indexOf('data-testid="dock-tabs"'));
  assert.ok(strip.indexOf("</div>") < strip.indexOf('aria-label="Open another document"'), "the `+` scrolls away with the tabs");
  // Their recipe, and the two ways it is easy to get wrong here.
  assert.match(CSS, /@keyframes edge-fade-horizontal/);
  assert.match(CSS, /animation-timeline: scroll\(self x\)/, "the fade no longer follows the strip's own scroll");
  assert.match(CSS, /@supports \(animation-timeline: scroll\(self x\)\)/, "an unsupporting browser gets a fade frozen at one end");
  assert.match(CSS, /@property --left-fade/, "the fade's lengths are unregistered, so nothing interpolates");
  assert.match(CSS, /--edge-fade-distance, 16px/, "the fade distance is in rem, which is 18px under this app's 112.5% root");
});

test("🔴🔴 a tab is their tab: bare until it is the front one, a separator between the rest, and a name that fades rather than ellipsises", () => {
  // Owner 2026-09-06, with his screenshot of the desktop pane: *"i need the tabs to actually match
  // the image i sent you one for one"*. Read out of `app-initial-*.js`, their own component:
  //   shell   group/tab relative flex h-8 shrink-0 items-center rounded-lg py-1 px-2 ps-2.5 (+pe-1.75)
  //   fill    a SEPARATE layer, absolute inset-x-px inset-y-0 rounded-md, border-hairline always
  //   active  border-default bg-surface-elevated-secondary shadow-tab-elevated (0 0 8px #0000000d)
  //   idle    border-transparent, ghost fill on hover only
  //   label   text-fade-truncate, a mask taking the last 16px to transparent
  //   sep     h-3 w-px absolute end-0 bg-border, hidden on the active tab, the one before it and the last
  assert.match(TABS, /h-\[32px\] max-w-\[156px\] shrink-0 items-center rounded-\[12\.5px\] py-\[4px\] pe-\[7px\] ps-\[10px\]/, "the tab left their box");
  assert.match(TABS, /pointer-events-none absolute inset-x-px inset-y-0 z-0 rounded-\[10px\] border-\[0\.5px\]/, "the fill is painted on the tab again, so every tab looks like a pill");
  assert.match(TABS, /shadow-\[0_0_8px_rgba\(0,0,0,0\.05\)\]/, "the front tab lost their shadow");
  assert.match(TABS, /border-transparent group-hover\/tab:bg-\(--ui-bg-tertiary\)\/60/, "an idle tab wears an edge or a fill");
  assert.match(TABS, /dock-tab-fade block min-w-0 flex-1 whitespace-nowrap text-start/, "the name ellipsises again");
  assert.match(CSS, /\.dock-tab-fade \{[\s\S]{0,300}?text-overflow: clip/, "the fade truncation is gone");
  assert.match(CSS, /--text-fade-truncate-distance, 16px/, "their fade distance is in rem, which is 18px here");
  assert.match(TABS, /absolute end-0 z-10 h-\[12px\] w-px shrink-0 bg-\(--ui-stroke-secondary\)/, "the separator between tabs is gone");
  assert.match(TABS, /const separated = index < items\.length - 1 && !current && items\[index \+ 1\]\?\.key !== active\?\.key;/, "a separator draws beside the front tab");
  assert.ok(!/gap-\[8px\] overflow-x-auto/.test(TABS), "the strip has a gap again; theirs is the separators' job");
});

test("🔴🔴 an answer's typography is their markdown system: one space unit, and a quote that is upright and full strength", () => {
  // Owner 2026-09-06: *"if you can look at chatgpt budle and copy the chat ui/ux as well so we have
  // a good base for chat"*. Read out of `app-initial-*.css` (`_MarkdownRoot_`): every margin,
  // indent and cell in their answer is a multiple of
  //   --markdown-space: calc(--markdown-font-size / 4)
  // which is 4px at this thread's 16px body. Their blockquote is the piece ours differed on:
  //   margin 0; border 0; padding-block 2x; padding-inline-start 6x; line-height 6x;
  //   color: text-primary; font-style: normal;
  //   ::after — inset-start 0, top/bottom 2x, width 1x, radius 0.5x, background border-medium
  assert.match(CHROME_CSS, /\.aui-md\.aui-md \{\s*--markdown-space: 4px;/, "the space unit is gone, so every number below is a loose measurement again");
  assert.match(CHROME_CSS, /:where\(blockquote\) \{[\s\S]{0,320}?font-style: normal;/, "a quote is italic again");
  assert.match(CHROME_CSS, /:where\(blockquote\) \{[\s\S]{0,320}?color: var\(--ui-text-primary\);/, "a quote is dimmer than the sentence around it again");
  assert.match(CHROME_CSS, /:where\(blockquote\)::after \{[\s\S]{0,300}?width: var\(--markdown-space\);/, "the quote's bar is not the reference's 4px");
  assert.match(CHROME_CSS, /:where\(blockquote\)::after \{[\s\S]{0,300}?border-radius: calc\(var\(--markdown-space\) \/ 2\);/, "the bar lost its round ends");
  assert.match(CHROME_CSS, /\.aui-md-code-block \{\s*margin-block: calc\(var\(--markdown-space\) \* 5\);/, "a fenced block lost the air theirs has");
  assert.match(CHROME_CSS, /:where\(th\):last-child \{\s*padding-inline-end: calc\(var\(--markdown-space\) \* 10\);/, "the table's last heading touches the edge again");
  assert.ok(!/padding-block: 0\.4rem;\s*padding-inline: 0 1\.25rem;/.test(CHROME_CSS), "the table's padding is back in rem, which renders 12.5% out under this root");
  assert.match(CHROME_CSS, /:where\(tbody tr:last-child td\) \{\s*border-block-end: 0;\s*padding-bottom: calc\(var\(--markdown-space\) \* 6\);/, "the table's last row sits on the sentence under it again");
  assert.ok(!/border-s-2 border-border ps-3 text-muted-foreground italic/.test(MARKDOWN), "the grey italic quote is back on the element");
  assert.match(CHROME_CSS, /:where\(blockquote p:first-of-type\)::before,\s*\.aui-md\.aui-md :where\(blockquote p:last-of-type\)::after \{\s*content: none;/, "Tailwind's curly quotation marks are back on a quote theirs leaves bare");
});
