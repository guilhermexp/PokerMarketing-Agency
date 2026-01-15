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

// Register service worker with auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Auto-reload when new version is available
    console.debug('[PWA] Nova versão disponível, recarregando...');
    updateSW(true);
  },
  onOfflineReady() {
    console.debug('[PWA] App pronto para uso offline');
  },
  onRegistered(registration) {
    console.debug('[PWA] Service Worker registrado');
    // Check for updates every 5 minutes
    if (registration) {
      setInterval(() => {
        registration.update();
      }, 5 * 60 * 1000);
    }
  },
});
