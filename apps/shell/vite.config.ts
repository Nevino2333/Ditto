import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import legacy from '@vitejs/plugin-legacy';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    vue(),
    legacy({
      targets: ['chrome >= 78', 'firefox >= 72', 'safari >= 13', 'edge >= 79'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      modernPolyfills: true,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: 'Ditto WebOS',
        short_name: 'Ditto',
        description: '基于 Web 的操作系统框架',
        theme_color: '#3b82f6',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: '/logo-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/logo-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@ditto/shared': resolve(__dirname, '../../packages/shared/src'),
      '@ditto/core': resolve(__dirname, '../../packages/core/src'),
      '@ditto/services': resolve(__dirname, '../../packages/services/src'),
      '@ditto/theme': resolve(__dirname, '../../packages/theme/src'),
      '@ditto/ui': resolve(__dirname, '../../packages/ui/src'),
      '@ditto/sdk': resolve(__dirname, '../../packages/sdk/src'),
      '@ditto/adapter': resolve(__dirname, '../../packages/adapter/src'),
    },
  },
  build: {
    target: 'es2015',
    cssTarget: 'chrome78',
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
