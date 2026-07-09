import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy sends /api to the Express server so the frontend and backend
// behave as one origin during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
