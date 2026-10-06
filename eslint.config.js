import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  { ignores: ["dist/", "node_modules/", "web/public/", "brazil_2026_president_map.html"] },
  js.configs.recommended,
  {
    files: ["web/src/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: globals.browser },
    rules: {
      "no-unused-vars": ["error", { args: "none" }],
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      "no-var": "error",
    },
  },
  { files: ["*.config.js", "tests/**/*.mjs"], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  prettier,
];
