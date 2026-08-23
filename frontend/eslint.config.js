import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...vue.configs['flat/recommended'],

  {
    files: ['**/*.vue', '**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-unused-vars': 'warn',
      'no-unused-vars': 'warn',
    },
  },
]
