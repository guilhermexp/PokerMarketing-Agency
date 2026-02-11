/**
 * ErrorNotificationTest
 *
 * Development-only component to test end-to-end error notification flows.
 * Simulates various API errors and verifies toast behavior.
 *
 * Test scenarios:
 * 1. Network errors with retry
 * 2. Server errors with retry
 * 3. Rate limit errors with exponential backoff
 * 4. Validation errors (non-recoverable)
 * 5. Auth errors (non-recoverable)
 * 6. Success notifications
 * 7. Warning notifications
 * 8. Info notifications
 */

import React, { useState } from 'react';
import { useApiErrorHandler } from '../../hooks/useApiErrorHandler';
import { useToast } from '../../stores/uiStore';
import { ToastContainer } from '../common/ToastContainer';

export const ErrorNotificationTest: React.FC = () => {
  const { handleApiError } = useApiErrorHandler();
  const toast = useToast();
  const [attemptCount, setAttemptCount] = useState(0);
  const [rateLimitCount, setRateLimitCount] = useState(0);

  // Simulate network error
  const simulateNetworkError = () => {
    const error = new Error('Failed to fetch');
    error.name = 'NetworkError';

    const retry = () => {
      setAttemptCount((prev) => prev + 1);
      toast.success(`Retry attempt #${attemptCount + 1} executed!`);
    };

    handleApiError(error, retry);
  };

  // Simulate server error (500)
  const simulateServerError = () => {
    const error = {
      response: {
        status: 500,
        data: { message: 'Internal server error' },
      },
    };

    const retry = async () => {
      setAttemptCount((prev) => prev + 1);
      // Simulate successful retry after 1 attempt
      if (attemptCount >= 1) {
        toast.success('Server recovered! Operation successful.');
        setAttemptCount(0);
      } else {
        toast.warning('Retrying server operation...');
        setTimeout(() => simulateServerError(), 1000);
      }
    };

    handleApiError(error, retry);
  };

  // Simulate rate limit error with exponential backoff
  const simulateRateLimitError = () => {
    const error = {
      response: {
        status: 429,
        data: { message: 'Too many requests' },
      },
    };

    const retry = async () => {
      setRateLimitCount((prev) => prev + 1);

      // Simulate success after 2 automatic retries
      if (rateLimitCount >= 2) {
        toast.success('Rate limit cleared! Operation successful.');
        setRateLimitCount(0);
        return;
      }

      // Simulate continued rate limiting
      const rateLimitError = {
        response: {
          status: 429,
          data: { message: 'Still rate limited' },
        },
      };
      throw rateLimitError;
    };

    handleApiError(error, retry);
  };

  // Simulate validation error (non-recoverable)
  const simulateValidationError = () => {
    const error = {
      response: {
        status: 400,
        data: {
          message: 'Invalid input',
          details: 'Name must be at least 3 characters',
        },
      },
    };

    handleApiError(error); // No retry for validation errors
  };

  // Simulate auth error (non-recoverable)
  const simulateAuthError = () => {
    const error = {
      response: {
        status: 401,
        data: { message: 'Unauthorized' },
      },
    };

    handleApiError(error); // No retry for auth errors
  };

  // Simulate success
  const simulateSuccess = () => {
    toast.success('Operation completed successfully!');
  };

  // Simulate warning
  const simulateWarning = () => {
    toast.warning('This action may have unintended consequences');
  };

  // Simulate info
  const simulateInfo = () => {
    toast.info('New feature available: Try our AI-powered content generator!');
  };

  // Test auto-dismiss timing
  const testAutoDismiss = () => {
    toast.info('This will dismiss in 5 seconds (info default)', 5000);

    setTimeout(() => {
      toast.success('This will dismiss in 4 seconds (success default)', 4000);
    }, 500);

    setTimeout(() => {
      toast.warning('This will dismiss in 7 seconds (warning default)', 7000);
    }, 1000);

    setTimeout(() => {
      toast.error('This will dismiss in 10 seconds (error default)', 10000);
    }, 1500);
  };

  return (
    <>
      <ToastContainer />
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          Error Notification E2E Test
        </h1>
        <p className="text-gray-400">
          Test all toast notification scenarios to verify end-to-end behavior
        </p>
      </div>

      {/* Recoverable Errors with Retry */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          Recoverable Errors (with Retry Button)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={simulateNetworkError}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-left"
          >
            <div className="font-semibold">Network Error</div>
            <div className="text-sm opacity-90">
              Should show error toast with retry button
            </div>
          </button>

          <button
            onClick={simulateServerError}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-left"
          >
            <div className="font-semibold">Server Error (500)</div>
            <div className="text-sm opacity-90">
              Shows retry button, succeeds after 1 retry
            </div>
          </button>
        </div>
      </section>

      {/* Rate Limit with Exponential Backoff */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          Rate Limit (Automatic Exponential Backoff)
        </h2>
        <div className="grid grid-cols-1 gap-4">
          <button
            onClick={simulateRateLimitError}
            className="px-4 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-left"
          >
            <div className="font-semibold">Rate Limit Error (429)</div>
            <div className="text-sm opacity-90">
              Auto-retries with countdown: 1s → 2s → 4s delays
            </div>
            {rateLimitCount > 0 && (
              <div className="text-xs mt-1 opacity-75">
                Retry count: {rateLimitCount}
              </div>
            )}
          </button>
        </div>
      </section>

      {/* Non-Recoverable Errors */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          Non-Recoverable Errors (no Retry)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={simulateValidationError}
            className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-left"
          >
            <div className="font-semibold">Validation Error (400)</div>
            <div className="text-sm opacity-90">
              Should show error toast WITHOUT retry button
            </div>
          </button>

          <button
            onClick={simulateAuthError}
            className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-left"
          >
            <div className="font-semibold">Auth Error (401)</div>
            <div className="text-sm opacity-90">
              Shows error without retry option
            </div>
          </button>
        </div>
      </section>

      {/* Other Toast Types */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          Other Notification Types
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={simulateSuccess}
            className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-left"
          >
            <div className="font-semibold">Success</div>
            <div className="text-sm opacity-90">4s duration</div>
          </button>

          <button
            onClick={simulateWarning}
            className="px-4 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-left"
          >
            <div className="font-semibold">Warning</div>
            <div className="text-sm opacity-90">7s duration</div>
          </button>

          <button
            onClick={simulateInfo}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-left"
          >
            <div className="font-semibold">Info</div>
            <div className="text-sm opacity-90">5s duration</div>
          </button>
        </div>
      </section>

      {/* Auto-Dismiss Test */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          Auto-Dismiss Duration Test
        </h2>
        <div className="grid grid-cols-1 gap-4">
          <button
            onClick={testAutoDismiss}
            className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-left"
          >
            <div className="font-semibold">Test All Durations</div>
            <div className="text-sm opacity-90">
              Stacks 4 toasts with different durations: info(5s), success(4s), warning(7s), error(10s)
            </div>
          </button>
        </div>
      </section>

      {/* Verification Checklist */}
      <section className="mt-12 p-6 bg-gray-800/50 rounded-lg border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">
          ✅ Verification Checklist
        </h2>
        <ul className="space-y-2 text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-1">□</span>
            <span>Trigger an API error → Toast appears with user-friendly message</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-1">□</span>
            <span>Error toasts have red styling, warnings yellow, success green, info blue</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-1">□</span>
            <span>Toasts auto-dismiss: error(10s), warning(7s), success(4s), info(5s)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-1">□</span>
            <span>Retry button appears for recoverable errors (network, server)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-1">□</span>
            <span>Clicking retry re-executes the failed operation</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-1">□</span>
            <span>Rate limit errors trigger automatic retry with countdown (1s, 2s, 4s)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-1">□</span>
            <span>Non-recoverable errors (validation, auth) do NOT show retry button</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-1">□</span>
            <span>Multiple toasts stack correctly in bottom-right corner</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-1">□</span>
            <span>Close button dismisses toast immediately</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-1">□</span>
            <span>No console errors during any test scenario</span>
          </li>
        </ul>
      </section>

      {/* Counter Display */}
      {(attemptCount > 0 || rateLimitCount > 0) && (
        <div className="mt-8 p-4 bg-gray-800 rounded-lg text-sm text-gray-300">
          <div className="font-semibold mb-2">Test State:</div>
          {attemptCount > 0 && <div>Retry attempts: {attemptCount}</div>}
          {rateLimitCount > 0 && <div>Rate limit retries: {rateLimitCount}</div>}
          <button
            onClick={() => {
              setAttemptCount(0);
              setRateLimitCount(0);
            }}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300"
          >
            Reset counters
          </button>
        </div>
      )}
        </div>
      </div>
    </>
  );
};
