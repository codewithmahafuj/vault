import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    server: {
      // This machine's Hyper-V/WinNAT port reservations cover 5100-5199, so
      // Vite's default 5173 cannot bind at all (EACCES, not "in use").
      // strictPort keeps a clash loud instead of drifting the URL that
      // ELECTRON_RENDERER_URL is built from.
      port: 5273,
      strictPort: true,
    },
  },
});
