/**
 * Global Error Handler Middleware
 *
 * Catches all errors in the application and provides:
 * - Consistent JSON error responses
 * - Structured logging with Pino
 * - Request ID tracking for debugging
 * - Environment-specific error details (stack traces in dev only)
 */

import logger from "../lib/logger.mjs";
import { AppError, ERROR_CODES, HTTP_STATUS } from "../lib/errors/index.mjs";
import { randomUUID } from "crypto";

/**
 * Generate or retrieve request ID for error tracking
 * @param {Object} req - Express request object
 * @returns {string}
 */
function getRequestId(req) {
  // Use existing request ID if available, otherwise generate new one
  return req.id || req.headers["x-request-id"] || randomUUID();
}

/**
 * Determine if we should include stack traces in response
 * @returns {boolean}
 */
function shouldIncludeStack() {
  return process.env.NODE_ENV !== "production";
}

/**
 * Format error response for API
 * @param {Error} error - Error object
 * @param {string} requestId - Request ID for tracking
 * @returns {Object}
 */
function formatErrorResponse(error, requestId) {
  // Handle AppError instances
  if (error instanceof AppError) {
    const response = {
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        requestId,
        timestamp: error.timestamp,
      },
    };

    // Include error details if present
    if (error.details) {
      response.error.details = error.details;
    }

    // Include stack trace in development
    if (shouldIncludeStack() && error.stack) {
      response.error.stack = error.stack;
    }

    return response;
  }

  // Handle generic errors
  const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const response = {
    error: {
      name: error.name || "Error",
      message: error.message || "An unexpected error occurred",
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      statusCode,
      requestId,
      timestamp: new Date().toISOString(),
    },
  };

  // Include stack trace in development
  if (shouldIncludeStack() && error.stack) {
    response.error.stack = error.stack;
  }

  return response;
}

/**
 * Log error with appropriate level based on severity
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {string} requestId - Request ID for tracking
 */
function logError(error, req, requestId) {
  const context = {
    requestId,
    method: req.method,
    url: req.url,
    path: req.path,
    userId: req.auth?.userId,
    organizationId: req.auth?.orgId,
    ip: req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
  };

  // Determine log level based on error type
  if (error instanceof AppError) {
    // Operational errors (expected errors)
    if (error.isOperational) {
      // Client errors (4xx) - log as warning
      if (error.statusCode < 500) {
        logger.warn(
          {
            err: error,
            ...context,
            code: error.code,
            details: error.details,
          },
          `Client error: ${error.message}`
        );
      } else {
        // Server errors (5xx) - log as error
        logger.error(
          {
            err: error,
            ...context,
            code: error.code,
            details: error.details,
          },
          `Server error: ${error.message}`
        );
      }
    } else {
      // Non-operational errors (programming errors) - log as fatal
      logger.fatal(
        {
          err: error,
          ...context,
          code: error.code,
          details: error.details,
        },
        `Fatal error: ${error.message}`
      );
    }
  } else {
    // Generic errors - log as error
    logger.error(
      {
        err: error,
        ...context,
      },
      `Unhandled error: ${error.message}`
    );
  }
}

/**
 * Global error handler middleware
 * Must be registered LAST in middleware chain
 *
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware (required by Express even if unused)
 */
export function errorHandler(err, req, res, next) {
  // Generate request ID for tracking
  const requestId = getRequestId(req);

  // Log the error with context
  logError(err, req, requestId);

  // Determine status code
  const statusCode =
    err instanceof AppError
      ? err.statusCode
      : err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  // Format and send error response
  const errorResponse = formatErrorResponse(err, requestId);

  // Set response headers
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json");

  // Add request ID to response headers for client-side tracking
  res.setHeader("X-Request-ID", requestId);

  // Send error response
  res.json(errorResponse);
}

/**
 * 404 Not Found handler
 * Call this before the error handler to catch undefined routes
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function notFoundHandler(req, res, next) {
  const error = new AppError(
    `Route not found: ${req.method} ${req.path}`,
    ERROR_CODES.ROUTE_NOT_FOUND,
    HTTP_STATUS.NOT_FOUND,
    true,
    {
      method: req.method,
      path: req.path,
    }
  );

  // Pass to error handler
  next(error);
}

/**
 * Async handler wrapper to catch errors in async route handlers
 * Use this to wrap async route handlers to avoid try-catch blocks
 *
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped handler that catches errors
 *
 * @example
 * app.get('/api/campaigns', asyncHandler(async (req, res) => {
 *   const campaigns = await getCampaigns();
 *   res.json(campaigns);
 * }));
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
