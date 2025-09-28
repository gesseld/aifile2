const js = require('@eslint/js')
const tsParser = require('@typescript-eslint/parser')
const tsPlugin = require('@typescript-eslint/eslint-plugin')

/**
 * Flat config (CJS) that supports both JS and TS without requiring a project tsconfig.
 * - ESLint will parse .ts/.tsx using @typescript-eslint/parser
 * - Avoids "Parsing error: Unexpected token ..." that occurs when using the default parser on TS
 */
module.exports = [
  // Base JS recommended
  js.configs.recommended,

  // Generic settings for all files (JS/TS)
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: [
      '**/node_modules/**',
      '**/venv/**',
      '**/.venv/**',
      '**/dist/**',
      '**/build/**',
      '**/.pytest_cache/**',
      '**/__pycache__/**',
      '**/.next/**',
      '**/coverage/**',
      'frontend/**/*.jsx',
      'frontend/**/*.tsx',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      semi: ['error', 'always'],
      quotes: ['error', 'single'],
      indent: ['error', 2],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
      eqeqeq: 'error',
      curly: 'error',
    },
  },

  // TypeScript-specific override
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        // Do not require a tsconfig to avoid project parsing errors
        project: null,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Replace base rule with TS-aware version
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
]
