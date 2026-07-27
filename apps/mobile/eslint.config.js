// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Unit tests run directly in Deno and intentionally use URL/JSR imports,
    // which the Metro-oriented import resolver cannot understand.
    ignores: ["dist/*", "**/*.test.ts"],
  },
  {
    rules: {
      // TypeScript is the source of truth for module resolution in this app.
      // This also permits optional native analytics modules loaded at runtime.
      "import/no-unresolved": "off",
      // These React Compiler diagnostics are not correctness rules and currently
      // reject React Native Animated/Gesture APIs that deliberately retain
      // mutable native values in refs.
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      // React Native Text nodes do not require HTML entity escaping.
      "react/no-unescaped-entities": "off",
    },
  }
]);
