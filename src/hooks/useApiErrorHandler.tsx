/**
 * API Error Handler Hook
 *
 * Provides a centralized way to handle API errors with user-friendly notifications.
 * Automatically determines if errors are recoverable and offers retry functionality.
 */

import { useCallback } from 'react';
import { useUiStore } from '../stores/uiStore';
import { parseApiError, isRecoverableError } from '../utils/errorMessages';

/**
 * Hook for handling API errors with toast notifications
 *
 * @example
 * ```tsx
 * const { handleApiError } = useApiErrorHandler();
 *
 * // Simple error handling
 * try {
 *   await apiCall();
 * } catch (error) {
 *   handleApiError(error);
 * }
 *
 * // With retry functionality
 * const retry = async () => {
 *   try {
 *     await apiCall();
 *   } catch (error) {
 *     handleApiError(error, retry);
 *   }
 * };
 * ```
 */
export function useApiErrorHandler() {
  const addToast = useUiStore((state) => state.addToast);

  /**
   * Handles an API error by displaying a user-friendly toast notification
   *
   * @param error - The error to handle (Error object, string, or API response)
   * @param retryFn - Optional retry function. If provided and error is recoverable, a retry button will be shown
   * @returns The toast ID
   */
  const handleApiError = useCallback(
    (error: unknown, retryFn?: () => void | Promise<void>) => {
      const parsed = parseApiError(error);
      const isRecoverable = isRecoverableError(error);

      // Build the message
      const message = parsed.action
        ? `${parsed.message}. ${parsed.action}`
        : parsed.message;

      // Add retry button if error is recoverable and retry function is provided
      const action =
        isRecoverable && retryFn
          ? {
              label: 'Tentar novamente',
              onClick: () => {
                const result = retryFn();
                // Handle async retry functions
                if (result instanceof Promise) {
                  result.catch((retryError) => {
                    // If retry fails, handle the error again (without retry button to avoid infinite loops)
                    handleApiError(retryError);
                  });
                }
              },
            }
          : undefined;

      // Display the toast
      return addToast({
        type: 'error',
        message,
        duration: 7000, // Longer duration for errors, especially with retry button
        action,
      });
    },
    [addToast]
  );

  return {
    handleApiError,
  };
}
