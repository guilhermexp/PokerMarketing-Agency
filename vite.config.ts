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
          // Use 'credentialless' instead of 'require-corp' to allow cross-origin resources
          // This still enables SharedArrayBuffer for FFmpeg WASM but doesn't require CORP headers
          'Cross-Origin-Embedder-Policy': 'credentialless',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
        proxy: {
          '/api/db': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
          '/api/generate': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
          '/api/upload': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
          '/api/proxy-video': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
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
        'process.env.DATABASE_URL': JSON.stringify(env.DATABASE_URL),
        'import.meta.env.VITE_DATABASE_URL': JSON.stringify(env.DATABASE_URL),
        'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(env.VITE_CLERK_PUBLISHABLE_KEY),
        'process.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY),
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
