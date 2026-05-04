import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
    {
        ignores: ['dist/**', 'node_modules/**', '*.mjs'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'off',
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
];
