import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
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
