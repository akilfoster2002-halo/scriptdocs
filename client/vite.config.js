import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
      '/collab': { target: 'ws://localhost:3000', ws: true },
      '/events': { target: 'ws://localhost:3000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the editor engine in its own chunk so the shell and the
        // document list load without paying for ProseMirror. Matched by
        // module path, since @tiptap/pm exposes only subpath exports.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
          if (/[\\/](yjs|y-websocket|y-protocols|lib0)[\\/]/.test(id)) return 'collab';
          return 'vendor';
        },
      },
    },
  },
});
