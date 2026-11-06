import { fileURLToPath } from 'node:url';
﻿import { defineConfig, mergeConfig } from 'vite';
import config from '../../vite.config';
export default defineConfig(async env => mergeConfig(await (config as Function)(env), {
  plugins: [{
    name: 'r4-cronogramas-local-storage',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === '../lib/firebaseDb' && importer?.replaceAll('\\', '/').endsWith('/src/components/Cronogramas.tsx')) {
        return fileURLToPath(new URL('./firebaseCronogramas.ts', import.meta.url));
      }
    },
  }],
  build: { outDir: '.r4/fixture-dist', rollupOptions: { input: 'scripts/fixtures/project.html' } },
}));
