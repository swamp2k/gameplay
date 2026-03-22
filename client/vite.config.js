import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api':       'http://localhost:3000',
      '/stream':    'http://localhost:3000',
      '/transcode': 'http://localhost:3000',
      '/thumbnail': 'http://localhost:3000',
      '/download':  'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
