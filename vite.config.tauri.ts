import { defineConfig } from 'vite';
import path from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: './',   // relative paths for file:// loading in Tauri production
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/spessasynth_lib/dist/spessasynth_processor.min.js',
          dest: './'
        }
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@scenes': path.resolve(__dirname, 'src/scenes'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@systems': path.resolve(__dirname, 'src/systems'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
  },
  build: {
    outDir: 'dist',
  },
  server: {
    port: 8080,
  },
});
