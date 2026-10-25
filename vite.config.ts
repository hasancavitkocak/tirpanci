import { defineConfig } from 'vite';

export default defineConfig({
  // Capacitor serves files from the app bundle, so asset URLs must be relative.
  base: './',
  // The dev server watches only the game's own files: not the artists' sources, the native projects or the
  // test pictures (watching those thousands of big files kept the computer busy).
  server: { watch: { ignored: ['**/assets-src/**', '**/test-output/**', '**/android/**', '**/ios/**', '**/dist/**', '**/release/**', '**/.gradle-home/**'] } },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 180000 },
});
