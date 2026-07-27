import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(packageJson.version),
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon-32.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'パチトラッカー',
        short_name: 'パチトラ',
        description: 'Pro EV Engine - パチンコ期待値トラッカー',
        start_url: './',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#05070d',
        icons: [
          {
            src: 'favicon-32.png',
            sizes: '32x32',
            type: 'image/png'
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // サイトセブンPDF解析は利用者がPDFを選んだ時だけ必要なため、
        // 初回インストールのプリキャッシュ（先に一括保存する容量）から外す。
        // 一度使った端末では下の実行時キャッシュに保存し、次回から再利用する。
        globIgnores: [
          '**/siteSevenPdfReader-*.js',
          '**/siteSevenImageOcr-*.js',
          '**/siteSevenImageOcrWorker-*.js',
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(?:siteSevenPdfReader-|siteSevenImageOcr(?:Worker)?-|pdf\.worker\.min-|Adobe-Japan1-)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'optional-pdf-tools-v1',
              expiration: {
                maxEntries: 6,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true
      }
    })
  ],
  base: '/pachi-tracker/',
})
