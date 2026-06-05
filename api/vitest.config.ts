import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['./src/__tests__/setup.ts'],
    server: {
      deps: {
        // pino and pino-pretty ship as ESM; inline them so Vitest can transform them
        inline: ['pino', 'pino-pretty'],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**', 'src/__tests__/**'],
    },
  },
});
