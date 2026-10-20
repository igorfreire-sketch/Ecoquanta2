import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { realpathSync } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = realpathSync(__dirname);

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    root: projectRoot,
    publicDir: false,
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // typo-js e CommonJS e roda dentro do worker do corretor: sem o pre-bundle o worker nao sobe.
    optimizeDeps: { include: ['typo-js'] },
    worker: { format: 'es' },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
