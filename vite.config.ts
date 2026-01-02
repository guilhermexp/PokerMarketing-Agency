import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(({ mode }) => {
    // Load from .env file
    const envFile = loadEnv(mode, '.', '');

    // Merge with process.env (Docker ENV vars take precedence)
    const env = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || envFile.GEMINI_API_KEY,
      VITE_CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY || envFile.VITE_CLERK_PUBLISHABLE_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || envFile.OPENROUTER_API_KEY,
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN || envFile.BLOB_READ_WRITE_TOKEN,
      DATABASE_URL: process.env.DATABASE_URL || envFile.DATABASE_URL,
      RUBE_TOKEN: process.env.RUBE_TOKEN || envFile.RUBE_TOKEN,
    };

    console.log('[Vite Config] GEMINI_API_KEY available:', !!env.GEMINI_API_KEY);

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
          '/api/ai': {
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
        'import.meta.env.VITE_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // FAL_KEY removed - video generation is now server-side via /api/ai/video
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
