import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  esbuild: {
    target: 'esnext',
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer']
  },
  // Configure WASM file serving
  server: {
    fs: {
      allow: ['..']
    }
  },
  // Ensure WASM files are served with correct MIME type
  assetsInclude: ['**/*.wasm']
})