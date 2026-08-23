import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

export default [
  js.configs.recommended,

  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node
    },
    plugins: {
      import: importPlugin
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

      // bonus
      "no-unreachable": "warn",
      "no-unused-labels": "warn"
    }
  }
];
