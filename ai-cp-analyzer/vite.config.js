import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // الـ proxy سيظل يعمل محلياً لو احتجت تختبر بورت 3001، 
    // ولكن على Vercel سيتم تجاهله واستخدام المسار النسبي تلقائياً
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
