import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
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
    },
  },
})
