import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'examples/**/dist/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value='SUPABASE_SERVICE_ROLE_KEY']",
          message: 'Morph never reads the service-role key at runtime. Run as the viewer.',
        },
      ],
    },
  },
  {
    files: ['packages/react/src/**/*.tsx'],
    rules: {
      // MO-007: copy lives in locales/en.json. Raw text in JSX is flagged.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[A-Za-z]{2,}/]',
          message: 'Put user-facing copy in locales/en.json and use t().',
        },
      ],
    },
  },
);
