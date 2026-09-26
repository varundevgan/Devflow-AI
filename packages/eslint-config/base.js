// Flat config (ESLint 9). Each app re-exports this from its own eslint.config.mjs
// and appends framework-specific rules.
//
// Dependencies are installed at the workspace root in Milestone 1; these imports
// will not resolve until then.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/.turbo/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Underscore prefix is the escape hatch for intentionally unused bindings.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // `any` is allowed only with an explicit eslint-disable and a reason.
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
    },
  },
  // Must stay last: turns off stylistic rules that would fight Prettier.
  prettier,
);
