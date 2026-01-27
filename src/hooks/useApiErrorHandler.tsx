/**
 * API Error Handler Hook
 *
 * Provides a centralized way to handle API errors with user-friendly notifications.
 * Automatically determines if errors are recoverable and offers retry functionality.
 * Implements exponential backoff for rate limit errors.
 */

import { useCallback, useRef } from 'react';
import { useUiStore } from '../stores/uiStore';
import { parseApiError, isRecoverableError } from '../utils/errorMessages';

/**
 * Delays for exponential backoff (in milliseconds)
 * [1s, 2s, 4s]
 */
const BACKOFF_DELAYS = [1000, 2000, 4000];

/**
 * Sleep utility function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const removeToast = useUiStore((state) => state.removeToast);

  // Track active retry operations to prevent duplicates
  const activeRetries = useRef(new Set<string>());

  /**
   * Handles rate limit errors with exponential backoff
   * Shows countdown toast and automatically retries
   */
  const handleRateLimitError = useCallback(
    async (retryFn: () => void | Promise<void>, attempt = 0): Promise<void> => {
      const retryKey = `retry-${Date.now()}`;

      // Prevent duplicate retries
      if (activeRetries.current.has(retryKey)) {
        return;
      }

      activeRetries.current.add(retryKey);

      try {
        const delay = BACKOFF_DELAYS[attempt];
        if (!delay) {
          // Max retries exceeded, show error with manual retry button
          const message = 'Muitas requisições simultâneas';
          addToast({
            type: 'error',
            message: `${message}. Aguarde alguns segundos e tente novamente.`,
            duration: 7000,
            action: {
              label: 'Tentar novamente',
              onClick: () => {
                const result = retryFn();
                if (result instanceof Promise) {
                  result.catch((error) => handleApiError(error));
                }
              },
            },
          });
          return;
        }

        // Show countdown toast
        const delaySeconds = delay / 1000;
        let remainingSeconds = delaySeconds;

        const toastId = addToast({
          type: 'warning',
          message: `Tentando novamente em ${remainingSeconds} segundo${remainingSeconds !== 1 ? 's' : ''}...`,
          duration: delay,
        });

        // Update countdown every second
        const countdownInterval = setInterval(() => {
          remainingSeconds -= 1;
          if (remainingSeconds > 0) {
            removeToast(toastId);
            addToast({
              type: 'warning',
              message: `Tentando novamente em ${remainingSeconds} segundo${remainingSeconds !== 1 ? 's' : ''}...`,
              duration: remainingSeconds * 1000,
            });
          }
        }, 1000);

        // Wait for the delay
        await sleep(delay);
        clearInterval(countdownInterval);
        removeToast(toastId);

        // Attempt retry
        const result = retryFn();
        if (result instanceof Promise) {
          await result.catch(async (retryError) => {
            const parsed = parseApiError(retryError);
            // If still rate limited, retry with next backoff
            if (parsed.type === 'rate_limit') {
              await handleRateLimitError(retryFn, attempt + 1);
            } else {
              // Different error, handle normally
              handleApiError(retryError);
            }
          });
        }
      } finally {
        activeRetries.current.delete(retryKey);
      }
    },
    [addToast, removeToast]
  );

  /**
   * Handles an API error by displaying a user-friendly toast notification
   *
   * @param error - The error to handle (Error object, string, or API response)
   * @param retryFn - Optional retry function. If provided and error is recoverable, a retry button will be shown.
   *                  For rate limit errors, automatic exponential backoff will be triggered.
   * @returns The toast ID
   */
  const handleApiError = useCallback(
    (error: unknown, retryFn?: () => void | Promise<void>) => {
      const parsed = parseApiError(error);
      const isRecoverable = isRecoverableError(error);

      // Handle rate limit errors with automatic exponential backoff
      if (parsed.type === 'rate_limit' && retryFn) {
        handleRateLimitError(retryFn, 0);
        return; // Don't show the regular error toast
      }

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
    [addToast, handleRateLimitError]
  );

  return {
    handleApiError,
  };
}
