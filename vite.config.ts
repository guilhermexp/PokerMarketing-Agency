import path from "path";
import { defineConfig, loadEnv } from "vite";
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
      port: 3000,
      host: "0.0.0.0",
      headers: {
        // Use 'credentialless' instead of 'require-corp' to allow cross-origin resources
        // This still enables SharedArrayBuffer for FFmpeg WASM but doesn't require CORP headers
        "Cross-Origin-Embedder-Policy": "credentialless",
        "Cross-Origin-Opener-Policy": "same-origin",
      },
      proxy: {
        "/api/chat": {
          target: "http://localhost:3002",
          changeOrigin: true,
        },
        "/api/db": {
          target: "http://localhost:3002",
          changeOrigin: true,
        },
        "/api/ai": {
          target: "http://localhost:3002",
          changeOrigin: true,
        },
        "/api/generate": {
          target: "http://localhost:3002",
          changeOrigin: true,
        },
        "/api/upload": {
          target: "http://localhost:3002",
          changeOrigin: true,
        },
        "/api/proxy-video": {
          target: "http://localhost:3002",
          changeOrigin: true,
        },
        "/api/rube": {
          target: "http://localhost:3002",
          changeOrigin: true,
        },
        "/api/admin": {
          target: "http://localhost:3002",
          changeOrigin: true,
        },
      },
    },
    plugins: [
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
          navigateFallback: "/index.html",
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
          // Force immediate update - don't wait for user to close all tabs
          skipWaiting: true,
          clientsClaim: true,
          // Clean old caches on update
          cleanupOutdatedCaches: true,
          // Add cache busting - use revision based on build time
          additionalManifestEntries: [],
          // Allow larger files to be cached (default is 2MB)
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
          // Don't restrict navigation fallback - allow all routes
          runtimeCaching: [],
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
      // Super admin emails for client-side admin check
      "import.meta.env.VITE_SUPER_ADMIN_EMAILS": JSON.stringify(
        process.env.VITE_SUPER_ADMIN_EMAILS || envFile.VITE_SUPER_ADMIN_EMAILS || "",
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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/xlsx")) {
              return "vendor-xlsx";
            }
            if (id.includes("node_modules/tesseract.js")) {
              return "vendor-tesseract";
            }
            if (id.includes("node_modules/@ffmpeg")) {
              return "vendor-ffmpeg";
            }
            if (id.includes("node_modules/@clerk")) {
              return "vendor-clerk";
            }
            if (id.includes("node_modules/recharts")) {
              return "vendor-recharts";
            }
            if (id.includes("node_modules/framer-motion")) {
              return "vendor-framer-motion";
            }
          },
        },
      },
    },
  };
});
