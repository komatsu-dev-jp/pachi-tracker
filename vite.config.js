import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
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
        cleanupOutdatedCaches: true,
        clientsClaim: true
      }
    })
  ],
  base: '/pachi-tracker/',
})
