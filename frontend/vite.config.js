import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development (`npm run dev`) Vite forwards /api to the Node backend.
// In the container, nginx does the same job (see nginx/default.conf.template).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
