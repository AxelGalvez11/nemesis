import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  InputAccessoryView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { GlassSurface } from "./GlassSurface";
import {
  appendEmptyBlock,
  blockIndexAtOffset,
  blockStartOffset,
  joinBlocks,
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
// updates — see docs in the PR), so the phone reveals syntax at BLOCK
// granularity: lib/note-blocks.ts splits the note into blocks, every block
// renders as real markdown, and ONLY the block you tap swaps into a raw-
// source TextInput. Tapping any other block (or the tail of the page) moves
// the reveal there; the document re-normalizes at each switch so typing a
// blank line mid-block splits it into real blocks.
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
        <GlassSurface style={styles.toolbarPill} fallbackColor={c.glassMenu} opaque shadow>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
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
    [styles, c, applyTool],
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
              selection={forcedSel ?? undefined}
              multiline
              autoFocus
              scrollEnabled={false}
              textAlignVertical="top"
              // A hint ONLY on a note with nothing in it yet. On any other block
              // a placeholder is just a label floating in the middle of your
              // writing — the "text box" look the owner called out (2026-07-22).
              placeholder={nb.blocks.length <= 1 && block.body === "" ? "Start writing" : undefined}
              placeholderTextColor={c.text3}
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
    // Floating pill above the keyboard (owner's ask verbatim) — centered, not
    // a full-width bar.
    toolbarRail: { alignItems: "center", paddingBottom: space(2), paddingHorizontal: space(3) },
    toolbarPill: {
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.line,
      overflow: "hidden",
      maxWidth: "100%",
    },
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
