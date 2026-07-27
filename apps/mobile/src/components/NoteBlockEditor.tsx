import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  InputAccessoryView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { GlassSurface } from "./GlassSurface";
import {
  appendEmptyBlock,
  blockIndexAtOffset,
  blockStartOffset,
  joinBlocks,
  mergeBlockIntoPrevious,
  replaceBlockBody,
  splitBlocks,
  type NoteBlocks,
} from "@/lib/note-blocks";
import {
  cycleHeading,
  insertDivider,
  insertLink,
  insertTable,
  toggleLinePrefix,
  toggleNumberedList,
  wrapInline,
  type EditSel,
} from "@/lib/note-edit";
import { ACCESSORY_BAR_HEIGHT, accessoryPillWidth } from "@/lib/accessory-bar";
import { preprocessWikilinks } from "@/lib/wikilinks";
import type { IconProps } from "./icons";
import {
  BoldIcon,
  BulletListIcon,
  CodeIcon,
  DividerIcon,
  HeadingIcon,
  HighlightIcon,
  ItalicIcon,
  LinkIcon,
  NumberedListIcon,
  QuoteIcon,
  StrikethroughIcon,
  TableIcon,
  UnderlineIcon,
  WikiLinkIcon,
} from "./note-toolbar-icons";
import { MessageBody } from "./MessageBody";
import { NoteTableEditor } from "./NoteTableEditor";
import { isTableBlock } from "@/lib/markdown-table";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// The phone library's LIVE-PREVIEW editor (owner 2026-07-21: "editing notes
// should work like the webapp — markdown syntax is not shown unless cursor
// reveals it"). The web editor is CodeMirror, a browser engine the phone
// can't run without a WebView (a native addition that would orphan OTA
// updates — see docs in the PR), so the phone reveals syntax one UNIT at a
// time: lib/note-blocks.ts splits the note into blocks, every block renders as
// real markdown, and ONLY the block you tap swaps into a raw-source TextInput.
// Tapping any other block (or the tail of the page) moves the reveal there; the
// document re-normalizes at each switch so typing a blank line mid-block splits
// it into real blocks.
//
// THE UNIT IS AS SMALL AS IT CAN HONESTLY BE (owner 2026-07-24: "markdown
// syntax should only be present when cursor is next to it"). Character-level
// hiding — the `**` disappearing while the caret is three words away — is not
// reachable in React Native at all: there is no way to render a text field
// whose displayed text differs from its value, and nested <Text> children can
// style characters but never omit them. What IS reachable is shrinking the
// unit, so a heading, a list item and a quote line are each their own block
// (splitLineOriented) and tapping one item of a six-item list no longer reveals
// all six items' dashes. Prose and wrapped list items stay whole, because a
// continuation line rendered alone would lose the item it belongs to.
//
// Smaller units mean more boundaries, which is why Backspace at offset 0 now
// merges with the block above (onActiveKeyPress) — joining two bullets is an
// everyday edit and must not read as a stuck keyboard.
//
// The formatting toolbar is the floating PILL riding above the keyboard
// (owner: "show a pill component above keyboard with editing toolbar") — an
// InputAccessoryView on iOS, pinned under the editor on Android (which has
// no accessory-view equivalent). Its buttons run the same pure transforms
// the web toolbar exposes (lib/note-edit.ts): heading cycle, bold, italic,
// underline, highlight, strikethrough, inline code, bullet/numbered list,
// quote, wikilink, link, divider, table — all toggle-aware where the web's
// are.
//
// This component owns block state only. The HOST owns persistence: every
// change reports the full joined document through onChangeText (feeding
// note.tsx's existing draftRef + debounced autosave), so save semantics are
// byte-identical to the old single-TextInput editor.

const TOOLBAR_ID = "note-block-toolbar";

// lib/accessory-bar.ts writes its height out as a literal so it can stay
// import-free and therefore testable. This line is what keeps that literal
// honest: both sides have literal types, so if `control.lg` changes and
// ACCESSORY_BAR_HEIGHT does not, `tsc` fails here rather than shipping a bar
// whose scroller and buttons are different heights.
//
// The rail padding needs no equivalent: the call site below passes `space(3)`
// straight into accessoryPillWidth, so there is nothing to drift out of step.
// (A first attempt asserted on it the same way and tsc rejected it — `space()`
// returns a plain `number`, not a literal. Passing the token was the better fix
// than weakening the check.)
const _accessoryBarIsOneControlTall: typeof ACCESSORY_BAR_HEIGHT = control.lg;
void _accessoryBarIsOneControlTall;
/** The table grid's own keyboard accessory — see NoteTableEditor's
 *  accessoryViewID for why it is a separate bar rather than this file's. */
const TABLE_TOOLBAR_ID = "note-table-toolbar";

interface ToolSpec {
  key: string;
  /** Drawn glyph, NOT the markdown the action writes — owner 2026-07-22: the row
   *  used to print the syntax itself ("==", "<>", "[[ ]]"), which read as a
   *  cheat sheet rather than buttons. See note-toolbar-icons.tsx. */
  Icon: ComponentType<IconProps>;
  label: string;
  transform: (s: EditSel) => EditSel;
}

const TOOLS: ToolSpec[] = [
  { Icon: HeadingIcon, key: "heading", label: "Heading", transform: cycleHeading },
  { Icon: BoldIcon, key: "bold", label: "Bold", transform: (s) => wrapInline(s, "**") },
  { Icon: ItalicIcon, key: "italic", label: "Italic", transform: (s) => wrapInline(s, "*") },
  { Icon: UnderlineIcon, key: "underline", label: "Underline", transform: (s) => wrapInline(s, "<u>", "</u>") },
  { Icon: HighlightIcon, key: "highlight", label: "Highlight", transform: (s) => wrapInline(s, "==") },
  { Icon: StrikethroughIcon, key: "strike", label: "Strikethrough", transform: (s) => wrapInline(s, "~~") },
  { Icon: CodeIcon, key: "code", label: "Inline code", transform: (s) => wrapInline(s, "`") },
  { Icon: BulletListIcon, key: "list", label: "Bullet list", transform: (s) => toggleLinePrefix(s, "- ") },
  { Icon: NumberedListIcon, key: "numbered", label: "Numbered list", transform: toggleNumberedList },
  { Icon: QuoteIcon, key: "quote", label: "Quote", transform: (s) => toggleLinePrefix(s, "> ") },
  { Icon: WikiLinkIcon, key: "wikilink", label: "Wiki link", transform: (s) => wrapInline(s, "[[", "]]") },
  { Icon: LinkIcon, key: "link", label: "Link", transform: insertLink },
  { Icon: DividerIcon, key: "divider", label: "Divider", transform: insertDivider },
  { Icon: TableIcon, key: "table", label: "Table", transform: insertTable },
];

export function NoteBlockEditor({
  content,
  header,
  onChangeText,
  topInset = 0,
}: {
  /** The document as it stood when edit mode opened. Changing it resets the editor. */
  content: string;
  /** Rendered above the first block, scrolls with the content (the note title). */
  header?: ReactNode;
  /** Fires with the FULL joined document on every keystroke/toolbar action. */
  onChangeText: (text: string) => void;
  /** Height of the floating chrome the text scrolls UP UNDER. Applied to the
   *  scroll CONTENT, never to the container: padding the container would put a
   *  hard edge under the chrome — the "top header" the owner asked us to
   *  replace with a fade (2026-07-22) — while a content inset lets the text
   *  slide beneath the blur exactly as reading mode does. */
  topInset?: number;
}) {
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  const { colors: c } = useTheme();
  // The toolbar's width has to be a NUMBER, not a percentage — see
  // lib/accessory-bar.ts. Taken from the window so rotation can't leave it stale.
  const { width: windowWidth } = useWindowDimensions();
  const pillWidth = accessoryPillWidth(windowWidth, space(3));

  const [nb, setNb] = useState<NoteBlocks>(() => splitBlocks(content));
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [forcedSel, setForcedSel] = useState<{ start: number; end: number } | null>(null);
  const nbRef = useRef(nb);
  nbRef.current = nb;
  const activeRef = useRef(activeIdx);
  activeRef.current = activeIdx;
  const selRef = useRef({ end: 0, start: 0 });
  // Bumped on every activation — lets the blur handler tell "the student left
  // the editor" apart from "focus is hopping to another block" (the hop's
  // blur fires first and must not deactivate the block being activated).
  const focusEpochRef = useRef(0);

  // A different note (or freshly-entered edit mode) resets the whole model.
  // A fully-empty document gets one empty block activated immediately — the
  // old single-TextInput editor auto-focused unconditionally, and an empty
  // page with no keyboard would read as broken (review finding 2026-07-21).
  useEffect(() => {
    const fresh = splitBlocks(content);
    focusEpochRef.current += 1;
    if (fresh.blocks.length === 0) {
      const seeded = appendEmptyBlock(fresh);
      setNb(seeded);
      setActiveIdx(seeded.blocks.length - 1);
    } else {
      setNb(fresh);
      setActiveIdx(null);
    }
    setForcedSel(null);
    selRef.current = { end: 0, start: 0 };
    // content is the only intended trigger: this is "new document arrived".
  }, [content]);

  const report = useCallback(
    (next: NoteBlocks) => {
      setNb(next);
      onChangeText(joinBlocks(next));
    },
    [onChangeText],
  );

  /** Re-split the whole document (so blank lines typed into a block become
   * real block boundaries) and re-find `trackIdx`'s block by char offset. */
  const normalized = useCallback((current: NoteBlocks, trackIdx: number | null): { nb: NoteBlocks; idx: number | null } => {
    const joined = joinBlocks(current);
    const next = splitBlocks(joined);
    if (trackIdx === null) return { idx: null, nb: next };
    return { idx: blockIndexAtOffset(next, blockStartOffset(current, trackIdx)), nb: next };
  }, []);

  const activateBlock = useCallback(
    (index: number) => {
      focusEpochRef.current += 1;
      const { nb: next, idx } = normalized(nbRef.current, index);
      setNb(next);
      setActiveIdx(Math.min(idx ?? index, Math.max(0, next.blocks.length - 1)));
      setForcedSel(null);
      selRef.current = { end: 0, start: 0 };
    },
    [normalized],
  );

  const deactivate = useCallback(() => {
    focusEpochRef.current += 1;
    const { nb: next } = normalized(nbRef.current, null);
    setNb(next);
    setActiveIdx(null);
    setForcedSel(null);
  }, [normalized]);

  // Keyboard dismissed / focus genuinely left the block editor: fold the raw
  // block back into rendered markdown. The epoch check skips the transient
  // blur that fires while focus hops between blocks.
  const onBlockBlur = useCallback(() => {
    const epoch = focusEpochRef.current;
    setTimeout(() => {
      if (focusEpochRef.current === epoch && activeRef.current !== null) deactivate();
    }, 120);
  }, [deactivate]);

  const onEditActive = useCallback(
    (text: string) => {
      const idx = activeRef.current;
      if (idx === null) return;
      report(replaceBlockBody(nbRef.current, idx, text));
    },
    [report],
  );

  /**
   * Backspace pressed with the caret at the very start of a block: join it to
   * the one above.
   *
   * This became necessary the moment a list turned into one block per item
   * (lib/note-blocks.ts's splitLineOriented): joining two bullets is an
   * everyday edit, and with each item in its own field the key would otherwise
   * do nothing at all — which reads as a stuck keyboard, not as a boundary.
   * Refused across a blank line, where the ordinary field behaviour (delete the
   * blank line) is the right one.
   */
  const onActiveKeyPress = useCallback(
    (key: string) => {
      if (key !== "Backspace") return;
      const idx = activeRef.current;
      if (idx === null) return;
      const { start, end } = selRef.current;
      if (start !== 0 || end !== 0) return;
      const merged = mergeBlockIntoPrevious(nbRef.current, idx);
      if (!merged) return;
      focusEpochRef.current += 1;
      setNb(merged.nb);
      onChangeText(joinBlocks(merged.nb));
      setActiveIdx(idx - 1);
      // Caret exactly where the two lines now meet, so the next keystroke
      // continues from the join rather than from the end of the merged line.
      selRef.current = { end: merged.caret, start: merged.caret };
      setForcedSel({ end: merged.caret, start: merged.caret });
    },
    [onChangeText],
  );

  const applyTool = useCallback(
    (transform: (s: EditSel) => EditSel) => {
      const idx = activeRef.current;
      if (idx === null) return;
      const body = nbRef.current.blocks[idx]?.body ?? "";
      const next = transform({ text: body, ...selRef.current });
      selRef.current = { end: next.end, start: next.start };
      setForcedSel({ end: next.end, start: next.start });
      report(replaceBlockBody(nbRef.current, idx, next.text));
    },
    [report],
  );

  // Tap under the last block: keep writing — append an empty block and put
  // the cursor in it.
  const onTailPress = useCallback(() => {
    focusEpochRef.current += 1;
    const { nb: next } = normalized(nbRef.current, null);
    const appended = appendEmptyBlock(next);
    setNb(appended);
    setActiveIdx(appended.blocks.length - 1);
    setForcedSel(null);
    selRef.current = { end: 0, start: 0 };
  }, [normalized]);

  // "The student is still working in this block." The table grid calls it as
  // focus moves from cell to cell: each hop blurs a TextInput, and without a
  // fresh epoch onBlockBlur would read that as leaving the block and fold the
  // grid back into rendered markdown between one cell and the next.
  const keepActive = useCallback(() => {
    focusEpochRef.current += 1;
  }, []);

  // A table gets the grid editor instead of a raw-source field, so its markdown
  // is never on screen. Anything that doesn't parse as a table falls through to
  // the ordinary field — see markdown-table.ts's parse contract.
  const activeBody = activeIdx === null ? "" : nb.blocks[activeIdx]?.body ?? "";
  const activeIsTable = activeIdx !== null && isTableBlock(activeBody);

  // In edit mode a link tap should EDIT the block, never navigate.
  const linkPressToActivate = useCallback(
    (index: number) => () => {
      activateBlock(index);
      return false;
    },
    [activateBlock],
  );

  const toolbar = useMemo(
    () => (
      <View style={styles.toolbarRail} pointerEvents="box-none">
        {/* The explicit width is load-bearing, not cosmetic: a horizontal
            ScrollView takes its width from its parent, and this pill used to be
            shrink-to-fit, so each was waiting on the other and the bar laid out
            zero pixels wide. lib/accessory-bar.ts has the whole story. */}
        <GlassSurface style={[styles.toolbarPill, { width: pillWidth }]} fallbackColor={c.glassMenu} opaque shadow>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            // Height for the same reason as the width above — a scroller has no
            // intrinsic size in either axis, and an accessory view sizes itself
            // to its child, so anything indefinite here renders as nothing.
            style={styles.toolbarScroll}
            contentContainerStyle={styles.toolbarRow}
          >
            {TOOLS.map((tool) => (
              <Pressable
                key={tool.key}
                onPress={() => applyTool(tool.transform)}
                style={({ pressed }) => [styles.toolBtn, pressed && styles.toolBtnPressed]}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={tool.label}
                testID={`note-tool-${tool.key}`}
              >
                <tool.Icon size={21} color={c.text} />
              </Pressable>
            ))}
          </ScrollView>
        </GlassSurface>
      </View>
    ),
    [styles, c, applyTool, pillWidth],
  );

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingTop: topInset }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="note-block-editor"
      >
        {header}
        {nb.blocks.map((block, i) =>
          i === activeIdx && activeIsTable ? (
            <NoteTableEditor
              // Keyed by BLOCK, not by focus epoch: the epoch changes on every
              // cell hop, and remounting the grid mid-edit would throw away both
              // its state and the caret.
              key={`table-${i}`}
              body={block.body}
              onChange={onEditActive}
              onInteract={keepActive}
              accessoryViewID={TABLE_TOOLBAR_ID}
            />
          ) : i === activeIdx ? (
            <TextInput
              key={`active-${focusEpochRef.current}`}
              style={styles.activeBlock}
              value={block.body}
              onChangeText={onEditActive}
              onSelectionChange={(e) => {
                selRef.current = e.nativeEvent.selection;
                if (forcedSel) setForcedSel(null);
              }}
              onBlur={onBlockBlur}
              onKeyPress={(e) => onActiveKeyPress(e.nativeEvent.key)}
              selection={forcedSel ?? undefined}
              multiline
              autoFocus
              scrollEnabled={false}
              textAlignVertical="top"
              // A hint ONLY on a note with nothing in it yet. On any other block
              // a placeholder is just a label floating in the middle of your
              // writing — the "text box" look the owner called out (2026-07-22).
              placeholder={nb.blocks.length <= 1 && block.body === "" ? "Start writing" : undefined}
              placeholderTextColor={c.textHint}
              inputAccessoryViewID={Platform.OS === "ios" ? TOOLBAR_ID : undefined}
              testID="note-block-input"
            />
          ) : (
            <Pressable
              key={`block-${i}`}
              onPress={() => activateBlock(i)}
              // No pressed-state wash: tapping a line of your own writing should
              // drop a caret, not flash like a table row (owner 2026-07-22).
              style={styles.renderedBlock}
              testID={`note-block-${i}`}
            >
              {block.body.trim() === "" ? (
                <View style={styles.emptyBlock} />
              ) : (
                <View pointerEvents="box-only">
                  {/* MessageBody, not a bare <Markdown>: an inactive block has
                      to render the SAME text the reader does — including the
                      ==highlight== and <u>underline</u> this very toolbar
                      writes (owner 2026-07-22). Through a bare <Markdown> the
                      formatting you just applied stayed raw syntax until you
                      left edit mode. */}
                  <MessageBody
                    content={preprocessWikilinks(block.body)}
                    styles={markdownStyles}
                    onLinkPress={linkPressToActivate(i)}
                  />
                </View>
              )}
            </Pressable>
          ),
        )}
        {/* The page tail: tap anywhere below the last block to keep writing. */}
        <Pressable style={styles.tail} onPress={onTailPress} testID="note-block-tail" accessibilityLabel="Continue writing" />
      </ScrollView>

      {/* The formatting pill: rides the keyboard on iOS; Android pins it at the
          editor's bottom edge (no accessory-view equivalent there). */}
      {/* Not over a table: the toolbar writes markdown into the block's raw
          source, which for a table would mean dropping `**` into the middle of
          the pipes the grid is hiding. The grid's own +/− controls are its
          toolbar. (On iOS this is automatic — the grid's cells don't claim the
          accessory view, so it simply doesn't appear.) */}
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={TOOLBAR_ID} backgroundColor="transparent">
          {toolbar}
        </InputAccessoryView>
      ) : activeIdx !== null && !activeIsTable ? (
        toolbar
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    // flexGrow so the tail below can stretch to the bottom of the screen — see
    // `tail`. paddingTop comes from the topInset prop, applied inline.
    scrollBody: { paddingHorizontal: space(5), paddingBottom: space(4), flexGrow: 1 },
    // The revealed (raw-source) block. Owner 2026-07-22: editing "should work
    // like any other notetaking app (like a notepad)" — so the block that holds
    // the caret is styled EXACTLY like the prose around it. It used to carry an
    // accent rail down its left edge as a "this is source" signal, which is
    // precisely what made a note look like a text box dropped onto the page.
    // The caret is the only cue needed, and it's the one a notepad gives you.
    activeBlock: { ...type.body, color: c.text, padding: 0, marginVertical: space(1), minHeight: 30 },
    renderedBlock: { borderRadius: radius.sm },
    emptyBlock: { height: 26 },
    // Tapping below the last line puts the caret there, the way a notepad does.
    // flexGrow (not a fixed height) so on a short note the target is the whole
    // rest of the page rather than a 180pt strip with dead space under it.
    tail: { flexGrow: 1, minHeight: 180 },
    // Floating pill above the keyboard (owner's ask verbatim). The rail centres
    // it; the WIDTH is applied inline from accessoryPillWidth() because it must
    // be a number — the `maxWidth: "100%"` that used to live here was a
    // percentage of a parent that had no width of its own, so it clamped nothing
    // and left the pill with no width to give the scroller inside it.
    toolbarRail: { alignItems: "center", paddingBottom: space(2), paddingHorizontal: space(3) },
    toolbarPill: {
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.line,
      overflow: "hidden",
    },
    // Both of the bar's dimensions are definite, and both had to be — see
    // lib/accessory-bar.ts, which owns the numbers and the reasoning. Short
    // version: an InputAccessoryView sizes itself to its child, a horizontal
    // ScrollView has no intrinsic size in either axis, so anything left to
    // "measure itself" here renders as nothing at all. The height was fixed on
    // 2026-07-23 and the toolbar was STILL invisible, because the width was the
    // same bug on the other axis. `toolbarRow` then centres the buttons in it.
    toolbarScroll: { height: ACCESSORY_BAR_HEIGHT },
    toolbarRow: { alignItems: "center", paddingHorizontal: space(1.5) },
    // Circle when it holds a single glyph, pill when a wider one needs the
    // room — never the rounded square this was (owner 2026-07-23: "make sure
    // there arent any square buttons").
    toolBtn: {
      minWidth: control.lg,
      height: control.lg,
      paddingHorizontal: space(1.5),
      borderRadius: control.lg / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    toolBtnPressed: { backgroundColor: c.surface2 },
  });
