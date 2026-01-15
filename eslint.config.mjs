import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
    js.configs.recommended,
    {
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                // Browser window/document
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',

                // Timers
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',

                // Common Web APIs
                Promise: 'readonly',
                fetch: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                indexedDB: 'readonly',
                navigator: 'readonly',
                Navigator: 'readonly',

                // File APIs
                File: 'readonly',
                FileReader: 'readonly',
                FileList: 'readonly',
                Blob: 'readonly',
                BlobPart: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                FormData: 'readonly',

                // HTML Elements
                HTMLElement: 'readonly',
                HTMLDivElement: 'readonly',
                HTMLTextAreaElement: 'readonly',
                HTMLInputElement: 'readonly',
                HTMLSelectElement: 'readonly',
                HTMLFormElement: 'readonly',
                HTMLImageElement: 'readonly',
                HTMLVideoElement: 'readonly',
                HTMLCanvasElement: 'readonly',
                HTMLButtonElement: 'readonly',
                HTMLAudioElement: 'readonly',

                // SVG
                SVGSVGElement: 'readonly',

                // Canvas & Image APIs
                Image: 'readonly',
                ImageData: 'readonly',
                CanvasRenderingContext2D: 'readonly',

                // Media APIs
                Audio: 'readonly',
                MediaStream: 'readonly',

                // Events
                Event: 'readonly',
                MouseEvent: 'readonly',
                KeyboardEvent: 'readonly',
                TouchEvent: 'readonly',

                // DOM APIs
                Node: 'readonly',
                Element: 'readonly',
                Text: 'readonly',
                Comment: 'readonly',

                // Observers
                ResizeObserver: 'readonly',
                IntersectionObserver: 'readonly',
                MutationObserver: 'readonly',

                // Notifications
                Notification: 'readonly',

                // IndexedDB
                IDBDatabase: 'readonly',
                IDBOpenDBRequest: 'readonly',
                IDBRequest: 'readonly',
                IDBTransaction: 'readonly',

                // XHR
                XMLHttpRequest: 'readonly',

                // Request/Response
                Request: 'readonly',
                Response: 'readonly',
                RequestInit: 'readonly',
                Headers: 'readonly',

                // Encoding
                TextDecoder: 'readonly',
                TextEncoder: 'readonly',
                atob: 'readonly',
                btoa: 'readonly',

                // Window methods
                alert: 'readonly',
                confirm: 'readonly',
                prompt: 'readonly',

                // Node.js globals (for test files and server-side code)
                process: 'readonly',
                global: 'readonly',
                Buffer: 'readonly',

                // React (for files that use JSX.Element without importing React)
                React: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
            react,
            'react-hooks': reactHooks,
        },
        rules: {
            ...tseslint.configs.recommended.rules,

            // React rules
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',

            // TypeScript rules - mais pragmático
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                // Permitir imports de tipos não usados
                ignoreRestSiblings: true,
                caughtErrors: 'none',
            }],
            '@typescript-eslint/explicit-module-boundary-types': 'off',

            // Console - permitir em desenvolvimento, warn em produção
            'no-console': ['warn', {
                allow: ['warn', 'error', 'info', 'debug']
            }],

            // React Hooks - warn ao invés de error
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // Variáveis não usadas em args - permitir com _
            'no-unused-vars': 'off', // Desligado porque usamos @typescript-eslint/no-unused-vars
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
    // Test files overrides
    {
        files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            'no-console': 'off',
        },
    },
    {
        ignores: ['dist/**', 'node_modules/**', '*.config.js', '*.config.ts', '*.config.mjs', 'server/**'],
    },
];
