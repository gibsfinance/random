import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import mocha from 'eslint-plugin-mocha'

export default [
  { languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  mocha.configs.flat.recommended,
  {
    ignores: [
      '.DS_Store',
      'node_modules',
      '.env*',
      '!.env.example',
      'pnpm-lock.yaml',
      'package-lock.yaml',
      'yarn.lock',
    ],
    rules: {
      'no-plusplus': 'off',
      'no-await-in-loop': 'off',
      'no-shadow': 'off',
      'prefer-destructuring': 'off',
      'no-use-before-define': [
        'error',
        {
          functions: false,
        },
      ],
      'no-restricted-syntax': 'off',
      'node/no-unpublished-require': 'off',
      'func-names': 'off',
      'import/no-dynamic-require': 'off',
      'global-require': 'off',
      'no-loop-func': 'off',
      'no-console': 'off',
      'node/no-missing-require': 'off',
      'import/no-unresolved': 'off',
      'mocha/no-mocha-arrows': 'off',
      'mocha/no-global-tests': 'off',
      'mocha/no-setup-in-describe': 'off',
      '@typescript-eslint/no-unused-vars': ["error", { "argsIgnorePattern": "^_" }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-use-before-define': 'off',
      "@typescript-eslint/no-unused-vars": [
            "error",
            { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
    },
  },
]
