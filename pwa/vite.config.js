import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  publicDir: 'public',
  server: {
    port: 1420,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
});
