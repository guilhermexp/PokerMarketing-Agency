/**
 * ToastContainer
 * Global toast notification container that subscribes to uiStore.toasts
 * Renders all active toasts in a fixed position (bottom-right)
 * Supports stacking multiple toasts
 */

import React from 'react';
import { useUiStore } from '../../stores/uiStore';
import type { Toast } from '../../stores/uiStore';
import { Icon } from './Icon';

interface ToastItemProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onClose }) => {
  const typeConfig = {
    success: {
      icon: 'check' as const,
      bgClass: 'bg-green-500/10 border-green-500/30 text-green-400',
    },
    error: {
      icon: 'alert-circle' as const,
      bgClass: 'bg-red-500/10 border-red-500/30 text-red-400',
    },
    warning: {
      icon: 'alert-circle' as const,
      bgClass: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    },
    info: {
      icon: 'info' as const,
      bgClass: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    },
  };

  const config = typeConfig[toast.type];

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border animate-in slide-in-from-bottom-4 min-w-[300px] max-w-[500px] ${config.bgClass}`}
      role="alert"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      <Icon name={config.icon} className="w-5 h-5 flex-shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium break-words">{toast.message}</p>

        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="mt-2 text-xs font-bold uppercase tracking-wide hover:underline focus:outline-none focus:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        onClick={() => onClose(toast.id)}
        className="p-1 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
        aria-label="Close notification"
      >
        <Icon name="x" className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const toasts = useUiStore((state) => state.toasts);
  const removeToast = useUiStore((state) => state.removeToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onClose={removeToast} />
        </div>
      ))}
    </div>
  );
};
