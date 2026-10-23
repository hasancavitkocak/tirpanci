import { defineConfig } from 'vite';

export default defineConfig({
  // Capacitor serves files from the app bundle, so asset URLs must be relative.
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 180000 },
});
