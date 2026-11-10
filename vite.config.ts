import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/nova-aigc-studio/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5070',
    },
  },
})
