import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

const hmrEnabled = process.env.PULSEPOINT_HMR === '1';

export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
    hmr: hmrEnabled ? undefined : false,
    proxy: {
      '/api': 'http://localhost:8787',
      '/uploads': 'http://localhost:8787',
    },
  },
})
