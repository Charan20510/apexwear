import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// run_dev.sh exports DJANGO_PORT when it's been overridden, so the proxy follows
// Django rather than assuming 8000.
const djangoTarget = `http://localhost:${process.env.DJANGO_PORT ?? '8000'}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': djangoTarget,
      '/media': djangoTarget,
    },
  },
})
