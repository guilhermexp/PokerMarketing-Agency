import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useUiStore, useToast } from '../uiStore';
import { act, renderHook } from '@testing-library/react';

describe('uiStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useUiStore.setState({
      activeModal: null,
      modalData: null,
      sidebarOpen: true,
      sidebarCollapsed: false,
      globalLoading: false,
      loadingMessage: null,
      toasts: [],
      currentView: 'dashboard',
    });
  });

  describe('Modal Management', () => {
    it('should open modal with data', () => {
      const { openModal, activeModal, modalData } = useUiStore.getState();

      openModal('imagePreview', { imageId: '123' });

      const state = useUiStore.getState();
      expect(state.activeModal).toBe('imagePreview');
      expect(state.modalData).toEqual({ imageId: '123' });
    });

    it('should close modal', () => {
      useUiStore.setState({
        activeModal: 'settings',
        modalData: { tab: 'general' },
      });

      useUiStore.getState().closeModal();

      const state = useUiStore.getState();
      expect(state.activeModal).toBeNull();
      expect(state.modalData).toBeNull();
    });

    it('should open modal without data', () => {
      useUiStore.getState().openModal('brandProfile');

      const state = useUiStore.getState();
      expect(state.activeModal).toBe('brandProfile');
      expect(state.modalData).toBeNull();
    });
  });

  describe('Sidebar', () => {
    it('should toggle sidebar', () => {
      expect(useUiStore.getState().sidebarOpen).toBe(true);

      useUiStore.getState().toggleSidebar();
      expect(useUiStore.getState().sidebarOpen).toBe(false);

      useUiStore.getState().toggleSidebar();
      expect(useUiStore.getState().sidebarOpen).toBe(true);
    });

    it('should set sidebar collapsed', () => {
      useUiStore.getState().setSidebarCollapsed(true);
      expect(useUiStore.getState().sidebarCollapsed).toBe(true);

      useUiStore.getState().setSidebarCollapsed(false);
      expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('Global Loading', () => {
    it('should set loading state without message', () => {
      useUiStore.getState().setGlobalLoading(true);

      const state = useUiStore.getState();
      expect(state.globalLoading).toBe(true);
      expect(state.loadingMessage).toBeNull();
    });

    it('should set loading state with message', () => {
      useUiStore.getState().setGlobalLoading(true, 'Gerando imagem...');

      const state = useUiStore.getState();
      expect(state.globalLoading).toBe(true);
      expect(state.loadingMessage).toBe('Gerando imagem...');
    });

    it('should clear loading state', () => {
      useUiStore.setState({
        globalLoading: true,
        loadingMessage: 'Loading...',
      });

      useUiStore.getState().setGlobalLoading(false);

      const state = useUiStore.getState();
      expect(state.globalLoading).toBe(false);
      expect(state.loadingMessage).toBeNull();
    });
  });

  describe('Toast Notifications', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should add toast and return id', () => {
      const id = useUiStore.getState().addToast({
        type: 'success',
        message: 'Operação concluída!',
      });

      expect(id).toMatch(/^toast-/);

      const state = useUiStore.getState();
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].message).toBe('Operação concluída!');
      expect(state.toasts[0].type).toBe('success');
    });

    it('should remove toast by id', () => {
      const id = useUiStore.getState().addToast({
        type: 'info',
        message: 'Test toast',
      });

      expect(useUiStore.getState().toasts).toHaveLength(1);

      useUiStore.getState().removeToast(id);

      expect(useUiStore.getState().toasts).toHaveLength(0);
    });

    it('should auto-remove toast after duration', () => {
      useUiStore.getState().addToast({
        type: 'success',
        message: 'Auto remove',
        duration: 3000,
      });

      expect(useUiStore.getState().toasts).toHaveLength(1);

      vi.advanceTimersByTime(3000);

      expect(useUiStore.getState().toasts).toHaveLength(0);
    });

    it('should clear all toasts', () => {
      useUiStore.getState().addToast({ type: 'success', message: 'Toast 1' });
      useUiStore.getState().addToast({ type: 'error', message: 'Toast 2' });
      useUiStore.getState().addToast({ type: 'warning', message: 'Toast 3' });

      expect(useUiStore.getState().toasts).toHaveLength(3);

      useUiStore.getState().clearToasts();

      expect(useUiStore.getState().toasts).toHaveLength(0);
    });
  });

  describe('View Navigation', () => {
    it('should set current view', () => {
      useUiStore.getState().setCurrentView('gallery');

      expect(useUiStore.getState().currentView).toBe('gallery');
    });
  });
});

describe('useToast hook', () => {
  beforeEach(() => {
    useUiStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should provide helper methods for toast types', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success('Success message');
      result.current.error('Error message');
      result.current.warning('Warning message');
      result.current.info('Info message');
    });

    const toasts = useUiStore.getState().toasts;
    expect(toasts).toHaveLength(4);
    expect(toasts[0].type).toBe('success');
    expect(toasts[1].type).toBe('error');
    expect(toasts[2].type).toBe('warning');
    expect(toasts[3].type).toBe('info');
  });
});
