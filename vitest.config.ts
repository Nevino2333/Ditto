import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@ditto/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@ditto/packager': path.resolve(__dirname, 'packages/packager/src'),
      '@ditto/core': path.resolve(__dirname, 'packages/core/src'),
    },
  },
});
