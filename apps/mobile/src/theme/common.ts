import { StyleSheet } from "react-native";

// Minimal shared styles for 6b-1 stubs. The full doc-13 design system (tokens,
// dark mode, typography scale) is fleshed out across 6b-2…6b-5.
export const common = StyleSheet.create({
  screen: { flex: 1, padding: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  h1: { fontSize: 26, fontWeight: "700" },
  sub: { fontSize: 14, opacity: 0.7 },
  body: { fontSize: 15, opacity: 0.8, lineHeight: 21 },
  input: {
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "#9aa4b2",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  btn: {
    backgroundColor: "#208AEF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  link: { color: "#208AEF", fontSize: 15 },
  linkBtn: { paddingVertical: 8 },
  err: { color: "#c0392b" },
});
