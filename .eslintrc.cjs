module.exports = {
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'unused-imports', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  settings: {
    'import/resolver': { typescript: {} },
  },
  rules: {
    'no-console': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'unused-imports/no-unused-imports': 'error',
    'import/no-unresolved': 'error',
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        pathGroups: [
          { pattern: '@api/**', group: 'internal', position: 'after' },
          { pattern: '@services/**', group: 'internal', position: 'after' },
          { pattern: '@core/**', group: 'internal', position: 'after' },
          { pattern: '@infra/**', group: 'internal', position: 'after' },
          { pattern: '@utils/**', group: 'internal', position: 'after' },
          { pattern: '@config/**', group: 'internal', position: 'after' },
        ],
        pathGroupsExcludedImportTypes: ['builtin'],
      },
    ],
    'prettier/prettier': 'warn',
  },
  overrides: [
    {
      files: ['*.d.ts'],
      rules: {
        'import/no-unresolved': 'off',
      },
    },
  ],
};
