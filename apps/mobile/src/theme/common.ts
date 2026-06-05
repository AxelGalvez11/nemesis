import { StyleSheet } from "react-native";
import { lightTheme } from "./theme";
import { radius, slate, space, teal, type } from "./tokens";

// Static shared styles for screens not yet migrated to the themed primitives. These
// are LIGHT-only (a StyleSheet can't react to the theme); the app stays light-locked
// until every screen consumes theme tokens (see ThemeProvider). Re-pointed onto the
// token ramps so the whole app shares one palette — a screen still on `common` looks
// consistent with the redesigned entry screens + themed primitives, not like a
// different app. Keys are unchanged: 11 screens import them.
const c = lightTheme.color;

export const common = StyleSheet.create({
  screen: { flex: 1, padding: space[6], gap: space[3], backgroundColor: c.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space[6],
    gap: space[3],
    backgroundColor: c.background,
  },
  h1: { ...type.h1, color: c.text },
  sub: { ...type.bodySm, color: c.textMuted },
  body: { ...type.body, color: c.text },
  input: {
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: c.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: space[3] + 2,
    paddingVertical: space[3],
    fontSize: 16,
    backgroundColor: c.inputBg,
    color: c.text,
  },
  btn: {
    backgroundColor: teal[500],
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    borderRadius: radius.md,
    alignSelf: "flex-start",
    minHeight: 48,
    justifyContent: "center",
  },
  btnText: { color: slate[0], fontWeight: "600", fontSize: 16 },
  link: { color: teal[600], fontSize: 15, fontWeight: "500" },
  linkBtn: { paddingVertical: space[2] },
  err: { color: c.danger },
});
