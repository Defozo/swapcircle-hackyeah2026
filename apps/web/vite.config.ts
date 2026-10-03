import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { buffer: 'buffer/' }, dedupe: ['react', 'react-dom', '@solana/wallet-adapter-react', '@solana/web3.js'] },
  base: './',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
  define: { global: 'globalThis' },
});
