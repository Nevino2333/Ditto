import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    server: {
      deps: {
        inline: ['lazystream', 'archiver'],
      },
    },
  },
  resolve: {
    alias: {
      '@ditto/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@ditto/packager': path.resolve(__dirname, 'packages/packager/src'),
      '@ditto/core': path.resolve(__dirname, 'packages/core/src'),
      'readable-stream/passthrough': path.resolve(__dirname, 'tests/shims/readable-stream-passthrough.js'),
      'readable-stream': path.resolve(__dirname, 'tests/shims/readable-stream.js'),
    },
  },
});
