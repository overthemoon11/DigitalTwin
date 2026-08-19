import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Contracts shared with the backend. Types only — erased at build time,
      // so this adds nothing to the bundle and creates no runtime coupling.
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    // shared/ sits above the Vite root, so it must be explicitly allowed.
    fs: { allow: ['..'] },
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3003',
        ws: true,
      },
    },
  },
});
