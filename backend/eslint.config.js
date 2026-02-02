import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  js.configs.recommended,

  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    },
    plugins: {
      import: importPlugin,
      sonarjs
    },
    rules: {
      // neiskorišćene varijable i funkcije
      "no-unused-vars": ["warn", {
        vars: "all",
        args: "after-used",
        ignoreRestSiblings: false
      }],

      // neiskorišćeni exporti
      "import/no-unused-modules": ["warn", { unusedExports: true }],

      // sonarjs dead code & smells
      "sonarjs/no-unused-collection": "warn",
      "sonarjs/no-identical-functions": "warn",

      // bonus
      "no-unreachable": "warn",
      "no-unused-labels": "warn"
    }
  }
];
