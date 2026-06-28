import assert from "node:assert/strict";
import { isThemePreference, resolveThemePreference, nextThemePreference } from "./theme-preference";

assert.equal(resolveThemePreference("system", false), "light");
assert.equal(resolveThemePreference("system", true), "grey");
assert.equal(resolveThemePreference("dark", false), "dark");
assert.equal(resolveThemePreference("grey", true), "grey");

assert.equal(isThemePreference("system"), true);
assert.equal(isThemePreference("dark"), true);
assert.equal(isThemePreference("sepia"), false);

assert.equal(nextThemePreference("system"), "light");
assert.equal(nextThemePreference("light"), "grey");
assert.equal(nextThemePreference("grey"), "dark");
assert.equal(nextThemePreference("dark"), "system");

console.log("theme-preference.test.ts OK");
