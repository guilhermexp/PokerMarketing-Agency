import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        headers: {
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
        proxy: {
          '/api/rube': {
            target: 'https://rube.app',
            changeOrigin: true,
            rewrite: (path) => '/mcp',
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('Authorization', `Bearer ${env.RUBE_TOKEN}`);
                proxyReq.setHeader('Accept', 'application/json, text/event-stream');
              });
            },
          },
        },
      },
      plugins: [
        react(),
        wasm(),
        topLevelAwait(),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.FAL_KEY': JSON.stringify(env.FAL_KEY),
        'import.meta.env.VITE_FAL_KEY': JSON.stringify(env.FAL_KEY),
        'process.env.RUBE_TOKEN': JSON.stringify(env.RUBE_TOKEN),
        'import.meta.env.VITE_RUBE_TOKEN': JSON.stringify(env.RUBE_TOKEN),
        'process.env.BLOB_READ_WRITE_TOKEN': JSON.stringify(env.BLOB_READ_WRITE_TOKEN),
        'import.meta.env.VITE_BLOB_READ_WRITE_TOKEN': JSON.stringify(env.BLOB_READ_WRITE_TOKEN),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
      },
    };
});
