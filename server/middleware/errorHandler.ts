/**
 * Global Error Handler Middleware
 *
 * Catches all errors in the application and provides:
 * - Consistent JSON error responses
 * - Structured logging with Pino
 * - Request ID tracking for debugging
 * - Environment-specific error details (stack traces in dev only)
 */

import type { Request, Response, NextFunction } from "express";
import logger from "../lib/logger.js";
import { sendError } from "../lib/response.js";
import { AppError, ERROR_CODES, HTTP_STATUS } from "../lib/errors/index.js";
import { randomUUID } from "crypto";

interface ErrorWithCode extends Error {
  code?: string;
  statusCode?: number;
}

interface ConnectionWithRemoteAddress {
  remoteAddress?: string;
}

interface ErrorResponsePayload {
  error: {
    name: string;
    message: string;
    code: string;
    statusCode: number;
    requestId: string;
    timestamp: string;
    details?: Record<string, unknown>;
    stack?: string;
  };
}

/**
 * Detect client disconnect errors (ECONNABORTED, ECONNRESET, EPIPE)
 */
export function isClientDisconnectError(error: Error | null | undefined): boolean {
  if (!error) return false;
  const errorWithCode = error as ErrorWithCode;
  const code = errorWithCode.code || "";
  const message = error.message || "";
  return (
    /ECONNABORTED|ECONNRESET|EPIPE/.test(code) ||
    /ECONNABORTED|ECONNRESET|EPIPE|aborted|socket hang up/.test(message)
  );
}

/**
 * Generate or retrieve request ID for error tracking
 */
function getRequestId(req: Request): string {
  // Use existing request ID if available, otherwise generate new one
  if (req.id) {
    return String(req.id);
  }
  const xRequestId = req.headers["x-request-id"];
  if (typeof xRequestId === "string") {
    return xRequestId;
  }
  return randomUUID();
}

/**
 * Determine if we should include stack traces in response
 */
function shouldIncludeStack(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Format error response for API
 */
function formatErrorResponse(error: Error, requestId: string): ErrorResponsePayload {
  // Handle AppError instances
  if (error instanceof AppError) {
    const response: ErrorResponsePayload = {
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
  const errorWithCode = error as ErrorWithCode;
  const statusCode = errorWithCode.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const response: ErrorResponsePayload = {
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
 */
function logError(error: Error, req: Request, requestId: string): void {
  const connection = req.connection as ConnectionWithRemoteAddress | undefined;
  const xForwardedFor = req.headers["x-forwarded-for"];
  const context = {
    requestId,
    method: req.method,
    url: req.url,
    path: req.path,
    userId: req.authUserId || req.internalAuth?.userId,
    organizationId: req.authOrgId || req.internalAuth?.orgId || null,
    ip: req.ip || (typeof xForwardedFor === "string" ? xForwardedFor : undefined) || connection?.remoteAddress,
  };

  // Client disconnect — log as warn, not error
  if (isClientDisconnectError(error)) {
    logger.warn(
      { err: error, ...context },
      `Client disconnected: ${error.message}`
    );
    return;
  }

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
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Generate request ID for tracking
  const requestId = getRequestId(req);

  // Log the error with context
  logError(err, req, requestId);

  // Skip response if client already disconnected or headers already sent
  if (res.headersSent || req.destroyed || res.destroyed) {
    return;
  }

  // Determine status code
  const errorWithCode = err as ErrorWithCode;
  const statusCode =
    err instanceof AppError
      ? err.statusCode
      : errorWithCode.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  // Format and send error response
  const errorResponse = formatErrorResponse(err, requestId);

  // Set response headers
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json");

  // Add request ID to response headers for client-side tracking
  res.setHeader("X-Request-ID", requestId);

  sendError(res, errorResponse);
}

/**
 * 404 Not Found handler
 * Call this before the error handler to catch undefined routes
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
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

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
type RouteHandler = (req: Request, res: Response, next: NextFunction) => void;

/**
 * Async handler wrapper to catch errors in async route handlers
 * Use this to wrap async route handlers to avoid try-catch blocks
 */
export function asyncHandler(fn: AsyncRouteHandler): RouteHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
