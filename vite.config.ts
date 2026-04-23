import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: '/phaser3/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@scenes': path.resolve(__dirname, 'src/scenes'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@systems': path.resolve(__dirname, 'src/systems'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
  },
  server: {
    port: 8080,
    open: true,
  },
});
