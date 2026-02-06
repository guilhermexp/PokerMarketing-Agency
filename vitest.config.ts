import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Ambiente de teste
    environment: 'jsdom',

    // Habilitar globals (describe, it, expect)
    globals: true,

    // Setup files
    setupFiles: ['./test/setup.ts'],

    // Incluir arquivos de teste
    include: [
      '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      '**/__tests__/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],

    // Excluir
    exclude: [
      '**/node_modules/**',
      '**/.auto-claude/**',
      '**/dist/**',
      '**/.vercel/**',
      'server/**',
    ],

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/types.ts',
        'server/',
      ],
      // Thresholds para garantir qualidade
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },

    // Timeout para testes assíncronos
    testTimeout: 10000,

    // Watch mode
    watch: false,
  },

  // Resolver aliases do projeto
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
