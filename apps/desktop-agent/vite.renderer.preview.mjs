import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone Vite server to preview the renderer in a browser (uses the mock
// preview-api when window.maxDesktop is absent). Not used by the Electron build.
// Paths are derived from this file's location so it works from any cwd.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(here, 'src/renderer'),
  plugins: [react()],
  resolve: { alias: { '@renderer': resolve(here, 'src/renderer/src') } },
  server: { host: '127.0.0.1', port: 5599, strictPort: true },
});
