import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const backendPort = Number(process.env.BACKEND_PORT || 3007);

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
    port: Number(process.env.FRONTEND_PORT || 3006),
    proxy: {
      // BACKEND_PORT exists so a second dev server can be pointed at a second
      // backend — running the visual QA against a test instance should not
      // require editing this file or stopping the one you are working in.
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${backendPort}`,
        ws: true,
      },
    },
  },
});
