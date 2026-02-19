import path from "path";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig(({ mode }) => {
  // Load from .env file
  const envFile = loadEnv(mode, ".", "");

  const env = {
    VITE_CLERK_PUBLISHABLE_KEY:
      process.env.VITE_CLERK_PUBLISHABLE_KEY ||
      envFile.VITE_CLERK_PUBLISHABLE_KEY,
    // SECURITY: Super admin emails should NOT be exposed to the client
    // Admin verification happens server-side only
  };

  return {
    server: {
      port: 3010,
      host: "0.0.0.0",
      headers: {
        // Use 'credentialless' instead of 'require-corp' to allow cross-origin resources
        // This still enables SharedArrayBuffer for FFmpeg WASM but doesn't require CORP headers
        "Cross-Origin-Embedder-Policy": "credentialless",
        "Cross-Origin-Opener-Policy": "same-origin",
      },
      proxy: {
        "/api": {
          target: "http://localhost:3002",
          changeOrigin: true,
        },
      },
    },
    plugins: [
      tailwindcss(),
      react(),
      wasm(),
      topLevelAwait(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.png", "logo-socialab.png", "logo-white.png"],
        manifest: {
          name: "Socialab",
          short_name: "Socialab",
          description: "Agencia de marketing para poker",
          theme_color: "#0c0c0c",
          background_color: "#0c0c0c",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "/pwa-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/pwa-512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "/pwa-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // Avoid terser hook race when generating very large precache manifests.
          mode: "development",
          sourcemap: false,
          navigateFallback: "/index.html",
          // Allow SPA fallback for authenticated Clerk handshake routes (/?__clerk_handshake=...)
          navigateFallbackAllowlist: [/^(?!\/api\/).*/],
          navigateFallbackDenylist: [/^\/api\//],
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
          // Force immediate update - don't wait for user to close all tabs
          skipWaiting: true,
          clientsClaim: true,
          // Clean old caches on update
          cleanupOutdatedCaches: true,
          // Allow larger files to be cached (default is 2MB)
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
          // Runtime caching strategies for better cache invalidation
          runtimeCaching: [
            {
              // Network-first for HTML - always try to get fresh version
              urlPattern: /^https:\/\/.*\/$/,
              handler: "NetworkFirst",
              options: {
                cacheName: "html-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60, // 1 hour
                },
                networkTimeoutSeconds: 3,
              },
            },
            {
              // Network-first for index.html specifically
              urlPattern: /\/index\.html$/,
              handler: "NetworkFirst",
              options: {
                cacheName: "html-cache",
                networkTimeoutSeconds: 3,
              },
            },
            {
              // Stale-while-revalidate for JS/CSS assets
              urlPattern: /\.(?:js|css)$/,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "assets-cache",
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
                },
              },
            },
            {
              // Cache-first for images (they rarely change)
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
              handler: "CacheFirst",
              options: {
                cacheName: "images-cache",
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
            {
              // Never cache authenticated API responses in SW cache
              urlPattern: /\/api\//,
              handler: "NetworkOnly",
            },
          ],
        },
        devOptions: {
          enabled: false, // Disable service worker in dev to avoid caching issues
        },
      }),
    ],
    define: {
      "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(
        env.VITE_CLERK_PUBLISHABLE_KEY,
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    optimizeDeps: {
      exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
    },
    esbuild: {
      drop: mode === 'production' ? ['debugger'] : [],
      pure: mode === 'production' ? ['console.log', 'console.debug'] : [],
    },
    build: {
      chunkSizeWarningLimit: 3000,
    },
  };
});
