import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
    {
        ignores: ['dist/**', 'node_modules/**', '*.mjs'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts', 'test/**/*.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
];
