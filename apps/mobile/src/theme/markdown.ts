import { radius } from "./tokens";
import { rgba } from "./palette";
import type { ThemeColors } from "./palette";

// react-native-markdown-display style map, themed. Shared by the chat answers, the note
// reader, and the flashcard review screen (all carry markdown). Sizes bumped ~1.15x
// (owner 2026-07-19: the app-scale increase didn't reach AI answers, which render through
// this map — not the type tokens).
export const createMarkdownStyles = (c: ThemeColors) =>
  ({
    body: { color: c.text, fontSize: 18, lineHeight: 28 },
    paragraph: { marginTop: 0, marginBottom: 12 },
    heading1: { color: c.text, fontSize: 27, lineHeight: 34, fontWeight: "700", marginTop: 18, marginBottom: 8 },
    heading2: { color: c.text, fontSize: 22, lineHeight: 29, fontWeight: "700", marginTop: 18, marginBottom: 6 },
    heading3: { color: c.text, fontSize: 19, lineHeight: 26, fontWeight: "600", marginTop: 14, marginBottom: 4 },
    heading4: { color: c.text, fontSize: 18, lineHeight: 25, fontWeight: "700", marginTop: 12, marginBottom: 4 },
    strong: { fontWeight: "700" as const },
    em: { fontStyle: "italic" as const },
    s: { textDecorationLine: "line-through" as const },
    link: { color: c.accent, textDecorationLine: "underline" as const },
    bullet_list: { marginBottom: 10 },
    ordered_list: { marginBottom: 10 },
    list_item: { marginBottom: 4 },
    blockquote: {
      backgroundColor: c.glass,
      borderLeftColor: c.accentLine,
      borderLeftWidth: 3,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: radius.sm,
    },
    code_inline: {
      backgroundColor: c.glass,
      color: c.text,
      borderRadius: 4,
      paddingHorizontal: 4,
      fontFamily: "Menlo",
      fontSize: 15,
    },
    code_block: {
      backgroundColor: c.glass,
      color: c.text,
      borderRadius: radius.sm,
      padding: 12,
      borderWidth: 1,
      borderColor: c.line,
      fontFamily: "Menlo",
      fontSize: 14.5,
    },
    fence: {
      backgroundColor: c.glass,
      color: c.text,
      borderRadius: radius.sm,
      padding: 12,
      borderWidth: 1,
      borderColor: c.line,
      fontFamily: "Menlo",
      fontSize: 14.5,
    },
    // A real grid, not a stack of underlined rows (owner 2026-07-24: "tables
    // need to have better column and cell borders"). Until now `tr` drew a
    // hairline under each row and `table` drew a frame around the lot, and
    // NOTHING drew a line between two columns — so a three-column table read as
    // three words that happened to sit near each other.
    //
    // Each cell paints its own RIGHT edge and the table gives up its own, so the
    // last cell's border becomes the table's right edge: one hairline
    // everywhere instead of a doubled 2pt seam down one side. overflow keeps the
    // corners inside the radius now that lines actually reach them. The header
    // gets the same wash the tap-to-edit grid uses (NoteTableEditor's
    // headerCell) so the two views of one table look like one table.
    table: { borderColor: c.line, borderWidth: 1, borderRightWidth: 0, borderRadius: radius.sm, overflow: "hidden" as const },
    th: { padding: 8, color: c.text, fontWeight: "700" as const, backgroundColor: c.surface, borderColor: c.line, borderRightWidth: 1 },
    td: { padding: 8, color: c.text, borderColor: c.line, borderRightWidth: 1 },
    tr: { borderColor: c.line, borderBottomWidth: 1 },
    bullet_list_icon: { color: c.text2 },
    ordered_list_icon: { color: c.text2 },
    hr: { backgroundColor: c.line, height: 1 },
    // The three Obsidian-flavoured marks the web note editor draws and the
    // phone used to print as raw syntax (lib/markdown-obsidian.ts). Tuned to
    // web's own decorations in library-live-editor.tsx: highlight is a stronger
    // accent wash, a tag is a soft accent pill, underline is just underlined.
    // Web washes a highlight at 24% accent and a tag at 13%; accentFaint is
    // 12%, so the tag uses it directly and the highlight needs its own,
    // stronger mix or it reads as a smudge on the true-black page.
    mark: { backgroundColor: rgba(c.accent, 0.24), color: c.text, borderRadius: 4 },
    tag: { backgroundColor: c.accentFaint, color: c.accent, fontWeight: "600" as const, borderRadius: 4 },
    u: { textDecorationLine: "underline" as const },
  }) as const;
