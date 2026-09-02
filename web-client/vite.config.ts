import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  // Without this, Vite's dependency crawler can pre-bundle 'firebase/functions'
  // separately from the other firebase/* submodules already in use (auth,
  // firestore, storage) — each getting its own copy of '@firebase/app' in the
  // optimized-deps graph, so the app instance created in firebase.ts registers
  // components against one copy while getFunctions() reads from another,
  // throwing "Service functions is not available". Listing every firebase
  // submodule here forces them into one shared pre-bundle.
  optimizeDeps: {
    include: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
  },
});
