import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  },
  // leaflet-draw ships as a UMD/CJS bundle; pre-bundling it with esbuild
  // (instead of letting Rollup analyze it as ESM) avoids a spurious
  // "default is not exported" build warning from react-leaflet-draw.
  optimizeDeps: {
    include: ['leaflet-draw']
  }
})
