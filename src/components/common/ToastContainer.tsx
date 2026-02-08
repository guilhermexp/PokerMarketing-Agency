/**
 * ToastContainer
 * Global toast notification container that subscribes to uiStore.toasts
 * Renders all active toasts in a fixed position (bottom-right)
 * Supports stacking multiple toasts
 */

import React from 'react';
import { useUiStore } from '../../stores/uiStore';
import { Toast } from '../ui/toast';
import { OverlayPortal } from './OverlayPortal';

export const ToastContainer: React.FC = () => {
  const toasts = useUiStore((state) => state.toasts);
  const removeToast = useUiStore((state) => state.removeToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <OverlayPortal>
      <div
        className="fixed bottom-4 right-4 z-[2147483645] flex flex-col gap-3 pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast
              variant={toast.type}
              onClose={() => removeToast(toast.id)}
              action={toast.action}
              className="min-w-[300px] max-w-[500px]"
            >
              {toast.message}
            </Toast>
          </div>
        ))}
      </div>
    </OverlayPortal>
  );
};
