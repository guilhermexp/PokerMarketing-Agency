import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { registerSW } from "virtual:pwa-register";
import Router from "./Router";
import "./styles/main.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key");
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <Router />
    </ClerkProvider>
  </React.StrictMode>,
);

// Clear old caches on startup to prevent stale versions
async function clearOldCaches() {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    const oldCaches = cacheNames.filter(name =>
      name.startsWith('workbox-') ||
      name.includes('precache')
    );
    await Promise.all(oldCaches.map(name => caches.delete(name)));
    if (oldCaches.length > 0) {
      console.debug('[PWA] Caches antigos removidos:', oldCaches);
    }
  }
}

// Register service worker with auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.debug('[PWA] Nova versão disponível, recarregando...');
    // Clear caches before updating
    clearOldCaches().then(() => {
      updateSW(true);
      // Force hard reload to bypass any remaining cache
      setTimeout(() => {
        window.location.reload();
      }, 100);
    });
  },
  onOfflineReady() {
    console.debug('[PWA] App pronto para uso offline');
  },
  onRegistered(registration) {
    console.debug('[PWA] Service Worker registrado');
    // Check for updates every 1 minute for faster detection
    if (registration) {
      setInterval(() => {
        registration.update();
      }, 60 * 1000); // 1 minute
    }
  },
  onRegisterError(error) {
    console.error('[PWA] Erro ao registrar Service Worker:', error);
    // Clear caches on error to prevent stuck state
    clearOldCaches();
  },
});
