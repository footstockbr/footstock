import { FlatCompat } from '@eslint/eslintrc'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  ...compat.extends(
    'next/core-web-vitals',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'import/no-anonymous-default-export': 'off',
    },
  },
  // ST004 — proibir Math.random() em cálculos financeiros de portfólio
  {
    files: [
      '**/portfolio/**',
      '**/repositories/position*',
      '**/repositories/Position*',
      '**/services/*Portfolio*',
      '**/services/*Position*',
    ],
    ignores: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.object.name="Math"][callee.property.name="random"]',
          message:
            'Math.random() is forbidden in financial calculations. Use real price_history data.',
        },
      ],
    },
  },
  // Relaxar regras em arquivos de teste
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/tests/**/*.ts',
      '**/tests/**/*.tsx',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: [
      'node_modules/',
      '.next/',
      'dist/',
      'coverage/',
      'prisma/seed/',
      'scripts/',
      'footstock-next/',
      'footstock-web/',
      'motor/dist/',
      'motor/coverage/',
      '.stryker-tmp/',
      'next-env.d.ts',
    ],
  },
]

export default eslintConfig
