import { StyleSheet } from "react-native";
import { c, radius, space, type } from "./tokens";

// Shared screen styles — dark (PharmaOrb tokens). Most screens compose these, so darkening them here
// carries the redesign across the app; screen-specific colors are fixed per screen.
export const common = StyleSheet.create({
  screen: { flex: 1, padding: space(6), gap: space(3), backgroundColor: c.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(3), backgroundColor: c.bg },
  h1: { ...type.h1, color: c.text },
  sub: { ...type.small, color: c.text2 },
  body: { fontSize: 15, lineHeight: 22, color: c.text2 },
  input: {
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: c.line2,
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(2.75),
    fontSize: 16,
    color: c.text,
    backgroundColor: c.surface,
  },
  btn: {
    backgroundColor: c.accent,
    paddingHorizontal: space(5),
    paddingVertical: space(3),
    borderRadius: radius.sm,
    alignSelf: "flex-start",
  },
  btnText: { color: c.onAccent, fontWeight: "600", fontSize: 16 },
  link: { color: c.accentDim, fontSize: 15 },
  linkBtn: { paddingVertical: space(2) },
  err: { color: c.danger },
});

// Default placeholder color for TextInputs that use `common.input` (RN can't put it in a StyleSheet).
export const PLACEHOLDER = c.text3;
