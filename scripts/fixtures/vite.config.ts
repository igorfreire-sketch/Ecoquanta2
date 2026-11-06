import { defineConfig, mergeConfig } from 'vite';
import config from '../../vite.config';
export default defineConfig(async env => mergeConfig(await (config as Function)(env), {
  build: { outDir: '.r4/fixture-dist', rollupOptions: { input: 'scripts/fixtures/project.html' } },
}));
