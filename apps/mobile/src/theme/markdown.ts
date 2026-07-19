import { radius } from "./tokens";
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
    table: { borderColor: c.line, borderWidth: 1, borderRadius: radius.sm },
    th: { padding: 8, color: c.text, fontWeight: "700" as const },
    td: { padding: 8, color: c.text },
    tr: { borderColor: c.line, borderBottomWidth: 1 },
    bullet_list_icon: { color: c.text2 },
    ordered_list_icon: { color: c.text2 },
    hr: { backgroundColor: c.line, height: 1 },
  }) as const;
