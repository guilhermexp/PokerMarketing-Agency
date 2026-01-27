/**
 * UI Store - Global UI state management
 *
 * Manages:
 * - Modal states (which modals are open)
 * - Sidebar state
 * - Global loading states
 * - Toast/notification queue
 * - Theme preferences
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { parseApiError } from '../utils/errorMessages';

// =============================================================================
// Types
// =============================================================================

export type ModalType =
  | 'imagePreview'
  | 'exportVideo'
  | 'quickPost'
  | 'schedulePost'
  | 'settings'
  | 'brandProfile'
  | 'generateOptions'
  | 'manualEvent'
  | null;

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number; // ms, default 5000
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface UiState {
  // Modal state
  activeModal: ModalType;
  modalData: Record<string, unknown> | null;

  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;

  // Global loading
  globalLoading: boolean;
  loadingMessage: string | null;

  // Toast notifications
  toasts: Toast[];

  // View state
  currentView: string;

  // Actions
  openModal: (modal: ModalType, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setGlobalLoading: (loading: boolean, message?: string) => void;
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  setCurrentView: (view: string) => void;
}

// =============================================================================
// Store
// =============================================================================

export const useUiStore = create<UiState>()(
  devtools(
    (set, get) => ({
      // Initial state
      activeModal: null,
      modalData: null,
      sidebarOpen: true,
      sidebarCollapsed: false,
      globalLoading: false,
      loadingMessage: null,
      toasts: [],
      currentView: 'dashboard',

      // Modal actions
      openModal: (modal, data = null) => {
        set({
          activeModal: modal,
          modalData: data,
        });
      },

      closeModal: () => {
        set({
          activeModal: null,
          modalData: null,
        });
      },

      // Sidebar actions
      toggleSidebar: () => {
        set((state) => ({
          sidebarOpen: !state.sidebarOpen,
        }));
      },

      setSidebarCollapsed: (collapsed) => {
        set({ sidebarCollapsed: collapsed });
      },

      // Loading actions
      setGlobalLoading: (loading, message = null) => {
        set({
          globalLoading: loading,
          loadingMessage: message,
        });
      },

      // Toast actions
      addToast: (toast) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newToast: Toast = {
          ...toast,
          id,
          duration: toast.duration ?? 5000,
        };

        set((state) => ({
          toasts: [...state.toasts, newToast],
        }));

        // Auto-remove after duration
        if (newToast.duration && newToast.duration > 0) {
          setTimeout(() => {
            get().removeToast(id);
          }, newToast.duration);
        }

        return id;
      },

      removeToast: (id) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      },

      clearToasts: () => {
        set({ toasts: [] });
      },

      // View actions
      setCurrentView: (view) => {
        set({ currentView: view });
      },
    }),
    { name: 'UiStore' }
  )
);

// =============================================================================
// Selectors (for performance optimization)
// =============================================================================

export const selectActiveModal = (state: UiState) => state.activeModal;
export const selectModalData = (state: UiState) => state.modalData;
export const selectSidebarOpen = (state: UiState) => state.sidebarOpen;
export const selectGlobalLoading = (state: UiState) => state.globalLoading;
export const selectToasts = (state: UiState) => state.toasts;

// =============================================================================
// Hooks for common patterns
// =============================================================================

/**
 * Hook to check if a specific modal is open
 */
export const useIsModalOpen = (modal: ModalType) => {
  return useUiStore((state) => state.activeModal === modal);
};

/**
 * Hook for toast notifications
 */
export const useToast = () => {
  const addToast = useUiStore((state) => state.addToast);
  const removeToast = useUiStore((state) => state.removeToast);

  return {
    success: (message: string, duration?: number) =>
      addToast({ type: 'success', message, duration }),
    error: (message: string, duration?: number) =>
      addToast({ type: 'error', message, duration }),
    warning: (message: string, duration?: number) =>
      addToast({ type: 'warning', message, duration }),
    info: (message: string, duration?: number) =>
      addToast({ type: 'info', message, duration }),
    /**
     * Converts an API error into a user-friendly toast notification
     * Uses parseApiError to extract message and suggested actions
     */
    errorFromApi: (error: unknown, duration?: number) => {
      const parsed = parseApiError(error);
      const message = parsed.action
        ? `${parsed.message}. ${parsed.action}`
        : parsed.message;

      return addToast({ type: 'error', message, duration });
    },
    dismiss: removeToast,
  };
};
