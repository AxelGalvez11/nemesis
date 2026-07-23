import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  InputAccessoryView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import { MessageBody } from "./MessageBody";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

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
  glyph: string;
  label: string;
  glyphStyle?: object;
  transform: (s: EditSel) => EditSel;
}

const TOOLS: ToolSpec[] = [
  { glyph: "H", key: "heading", label: "Heading", transform: cycleHeading },
  { glyph: "B", glyphStyle: { fontWeight: "800" as const }, key: "bold", label: "Bold", transform: (s) => wrapInline(s, "**") },
  { glyph: "I", glyphStyle: { fontStyle: "italic" as const }, key: "italic", label: "Italic", transform: (s) => wrapInline(s, "*") },
  {
    glyph: "U",
    glyphStyle: { textDecorationLine: "underline" as const },
    key: "underline",
    label: "Underline",
    transform: (s) => wrapInline(s, "<u>", "</u>"),
  },
  { glyph: "==", key: "highlight", label: "Highlight", transform: (s) => wrapInline(s, "==") },
  {
    glyph: "S",
    glyphStyle: { textDecorationLine: "line-through" as const },
    key: "strike",
    label: "Strikethrough",
    transform: (s) => wrapInline(s, "~~"),
  },
  { glyph: "<>", key: "code", label: "Inline code", transform: (s) => wrapInline(s, "`") },
  { glyph: "•", key: "list", label: "Bullet list", transform: (s) => toggleLinePrefix(s, "- ") },
  { glyph: "1.", key: "numbered", label: "Numbered list", transform: toggleNumberedList },
  { glyph: ">", key: "quote", label: "Quote", transform: (s) => toggleLinePrefix(s, "> ") },
  { glyph: "[[ ]]", key: "wikilink", label: "Wiki link", transform: (s) => wrapInline(s, "[[", "]]") },
  { glyph: "↗", key: "link", label: "Link", transform: insertLink },
  { glyph: "—", key: "divider", label: "Divider", transform: insertDivider },
  { glyph: "▦", key: "table", label: "Table", transform: insertTable },
];

export function NoteBlockEditor({
  content,
  header,
  onChangeText,
}: {
  /** The document as it stood when edit mode opened. Changing it resets the editor. */
  content: string;
  /** Rendered above the first block, scrolls with the content (the note title). */
  header?: ReactNode;
  /** Fires with the FULL joined document on every keystroke/toolbar action. */
  onChangeText: (text: string) => void;
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
                <Text style={[styles.toolGlyph, tool.glyphStyle]}>{tool.glyph}</Text>
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
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="note-block-editor"
      >
        {header}
        {nb.blocks.map((block, i) =>
          i === activeIdx ? (
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
              placeholder="Write…"
              placeholderTextColor={c.text3}
              inputAccessoryViewID={Platform.OS === "ios" ? TOOLBAR_ID : undefined}
              testID="note-block-input"
            />
          ) : (
            <Pressable
              key={`block-${i}`}
              onPress={() => activateBlock(i)}
              style={({ pressed }) => [styles.renderedBlock, pressed && styles.renderedBlockPressed]}
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
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={TOOLBAR_ID} backgroundColor="transparent">
          {toolbar}
        </InputAccessoryView>
      ) : activeIdx !== null ? (
        toolbar
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scrollBody: { paddingHorizontal: space(5), paddingTop: space(2), paddingBottom: space(4) },
    // The revealed (raw-source) block: same body type as the rendered prose so
    // swapping in never jolts the layout, plus a thin accent rail as the "this
    // is source" signal.
    activeBlock: {
      ...type.body,
      color: c.text,
      padding: 0,
      paddingLeft: space(2.5),
      borderLeftWidth: 2,
      borderLeftColor: c.accentLine,
      marginVertical: space(1),
      minHeight: 30,
    },
    renderedBlock: { borderRadius: radius.sm },
    renderedBlockPressed: { backgroundColor: c.glass },
    emptyBlock: { height: 26 },
    // Generous tail so "tap below the text to keep writing" always has a target.
    tail: { minHeight: 180 },
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
    toolBtn: {
      minWidth: 40,
      height: 42,
      paddingHorizontal: space(1.5),
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    toolBtnPressed: { backgroundColor: c.surface2 },
    toolGlyph: { ...type.title, color: c.text },
  });
