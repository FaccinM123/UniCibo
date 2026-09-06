import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Config Vite minimale: plugin Vue 3 + alias @ -> src, comodo per gli import
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
