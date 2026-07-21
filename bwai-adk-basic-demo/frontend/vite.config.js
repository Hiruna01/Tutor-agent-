import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The ADK API server (`adk api_server`) runs on :8000. We proxy its routes so
// the browser talks to Vite same-origin — no CORS, no --allow_origins needed.
const ADK = process.env.ADK_URL || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/apps': { target: ADK, changeOrigin: true },
      '/run_sse': { target: ADK, changeOrigin: true },
      '/run': { target: ADK, changeOrigin: true },
      '/list-apps': { target: ADK, changeOrigin: true },
    },
  },
})
