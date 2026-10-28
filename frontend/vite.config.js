import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const basePath = process.env.VITE_BASE_PATH || '/'
const backendTarget = process.env.VITE_BACKEND_TARGET || 'http://localhost:8050'
const backendWsTarget = backendTarget.replace(/^http/i, 'ws')

export default defineConfig({
  base: basePath,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': backendTarget,
      '/sim/api': backendTarget,
      '/ws': {
        target: backendWsTarget,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            const silent = ['EPIPE', 'ECONNRESET', 'ECONNREFUSED'].includes(err.code)
              || err.message?.includes('ended by the other party')
              || err.message?.includes('write after end');
            if (!silent) console.error('[ws proxy]', err.message);
          });
        },
      },
      '/sim/ws': {
        target: backendWsTarget,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            const silent = ['EPIPE', 'ECONNRESET', 'ECONNREFUSED'].includes(err.code)
              || err.message?.includes('ended by the other party')
              || err.message?.includes('write after end');
            if (!silent) console.error('[sim/ws proxy]', err.message);
          });
        },
      },
    },
  },
})
