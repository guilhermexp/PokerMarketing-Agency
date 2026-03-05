/**
 * Zustand Stores - Barrel Export
 *
 * Este arquivo re-exporta todos os stores para fácil importação.
 * Uso: import { useUiStore, useJobsStore } from '@/stores';
 */

// UI Store - Global UI state (modals, sidebar, toasts)
export {
  useUiStore,
  useIsModalOpen,
  useToast,
  selectActiveModal,
  selectModalData,
  selectSidebarOpen,
  selectGlobalLoading,
  selectToasts,
  type ModalType,
  type Toast,
  type UiState,
} from './uiStore';

// Jobs Store - Background generation jobs
export {
  useJobsStore,
  useGenerationJobStore,
  useJobCounts,
  selectJobs,
  selectPendingJobs,
  selectCompletedJobs,
  selectFailedJobs,
  selectIsLoading,
  selectScheduledPostNotifications,
  type ActiveJob,
  type ScheduledPostNotification,
  type JobType,
  type JobStatus,
} from './jobsStore';

// Feedback Store - Client feedback mode toggle
export { useFeedbackStore } from './feedbackStore';

// Version for debugging
export const STORES_VERSION = '1.0.0';
