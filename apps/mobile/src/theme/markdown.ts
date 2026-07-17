import { radius } from "./tokens";
import type { ThemeColors } from "./palette";

// react-native-markdown-display style map, themed. Shared by the note reader
// and the flashcard review screen (cards carry markdown too).
export const createMarkdownStyles = (c: ThemeColors) =>
  ({
    body: { color: c.text, fontSize: 15.5, lineHeight: 24 },
    heading1: { color: c.text, fontSize: 24, lineHeight: 30, fontWeight: "700", marginTop: 18, marginBottom: 6 },
    heading2: { color: c.text, fontSize: 20, lineHeight: 26, fontWeight: "700", marginTop: 16, marginBottom: 4 },
    heading3: { color: c.text, fontSize: 17, lineHeight: 23, fontWeight: "600", marginTop: 12, marginBottom: 2 },
    strong: { fontWeight: "700" as const },
    link: { color: c.accent },
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
      fontSize: 13.5,
    },
    code_block: {
      backgroundColor: c.glass,
      color: c.text,
      borderRadius: radius.sm,
      padding: 12,
      borderWidth: 1,
      borderColor: c.line,
      fontFamily: "Menlo",
      fontSize: 13,
    },
    fence: {
      backgroundColor: c.glass,
      color: c.text,
      borderRadius: radius.sm,
      padding: 12,
      borderWidth: 1,
      borderColor: c.line,
      fontFamily: "Menlo",
      fontSize: 13,
    },
    table: { borderColor: c.line, borderWidth: 1, borderRadius: radius.sm },
    th: { padding: 8, color: c.text, fontWeight: "700" as const },
    td: { padding: 8, color: c.text },
    tr: { borderColor: c.line, borderBottomWidth: 1 },
    bullet_list_icon: { color: c.text2 },
    ordered_list_icon: { color: c.text2 },
    hr: { backgroundColor: c.line, height: 1 },
  }) as const;
