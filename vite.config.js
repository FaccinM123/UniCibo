import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// Config Vite: plugin Vue 3 + alias @ -> src + PWA (manifest + service
// worker generati da vite-plugin-pwa/Workbox al build).
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'UniCibo',
        short_name: 'UniCibo',
        description: 'Social network a gruppi per condividere ricette che si cucinano davvero.',
        theme_color: '#D97D46',
        background_color: '#F7F4F0',
        display: 'standalone',
        start_url: '/',
        lang: 'it',
        dir: 'ltr',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Precache degli asset statici (JS/CSS/icone) generato da Workbox.
        // Le chiamate Firestore/Firebase Auth (dominii googleapis.com/
        // firebaseio.com) non vengono intercettate: restano gestite
        // dall'SDK Firebase stesso, mai servite da cache stantia.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}']
      }
    })
  ],
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
