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
      '**/e2e/**',
    ],

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: [
        'server/lib/api-docs.ts',
        'server/lib/response.ts',
        'server/lib/response-middleware.ts',
        'server/lib/errors/**/*.ts',
        'server/lib/validation/**/*.ts',
        'server/middleware/errorHandler.ts',
        'server/middleware/validate.ts',
        // Keep coverage focused on executable server contracts instead of declarative schema files.
        'server/schemas/api-contracts.ts',
        'server/services/upload-service.ts',
      ],
      exclude: [
        'node_modules/',
        'test/',
        'src/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/types.ts',
        'server/api/**',
        'server/app.ts',
        'server/dev-api.ts',
        'server/helpers/**',
        'server/index.ts',
        'server/lib/agent/**',
        'server/lib/ai/**',
        'server/migrations/**',
        'server/types/**',
      ],
      // Thresholds para garantir qualidade
      thresholds: {
        statements: 70,
        branches: 60,
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
