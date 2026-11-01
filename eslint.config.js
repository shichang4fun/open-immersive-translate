import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dist-firefox/**",
      "dist-safari/**",
      "dist-safari-ios/**",
      "build-safari/**",
      "build-safari-ios/**",
      "dist-userscript/**",
      "node_modules/**",
      ".vite/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
