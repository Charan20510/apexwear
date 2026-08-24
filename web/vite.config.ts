import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// run_dev.sh exports DJANGO_PORT/SEARCH_PORT when overridden, so the proxies
// follow the real ports rather than assuming the defaults.
const djangoTarget = `http://localhost:${process.env.DJANGO_PORT ?? '8000'}`
const searchTarget = `http://localhost:${process.env.SEARCH_PORT ?? '8001'}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': djangoTarget,
      '/media': djangoTarget,
      '/search': searchTarget,
    },
  },
})
