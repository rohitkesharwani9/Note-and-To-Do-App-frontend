import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const previewPort = Number.parseInt(process.env.PORT ?? '', 10)

export default defineConfig({
  plugins: [react()],
  preview: {
    host: true,
    port: Number.isFinite(previewPort) && previewPort > 0 ? previewPort : 4173,
  },
})
