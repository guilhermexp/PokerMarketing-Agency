/**
 * Application Error Classes
 * Specific error types for common error scenarios
 */

import { AppError, ERROR_CODES, HTTP_STATUS, type ErrorDetails } from "./AppError.js";

// Re-export base error and constants
export { AppError, ERROR_CODES, HTTP_STATUS, type ErrorDetails };

/**
 * Validation Error (400)
 * Thrown when request data fails validation
 */
export class ValidationError extends AppError {
  constructor(message: string = "Validation failed", details: ErrorDetails | null = null) {
    super(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, true, details);
  }
}

/**
 * Authentication Error (401)
 * Thrown when authentication fails or is missing
 */
export class AuthError extends AppError {
  constructor(message: string = "Authentication required", code: string = ERROR_CODES.UNAUTHORIZED) {
    super(message, code, HTTP_STATUS.UNAUTHORIZED, true);
  }
}

/**
 * Permission Denied Error (403)
 * Thrown when user lacks required permissions
 */
export class PermissionDeniedError extends AppError {
  constructor(permission?: string) {
    const message = permission
      ? `Permission denied: ${permission}`
      : "Permission denied";
    super(message, ERROR_CODES.PERMISSION_DENIED, HTTP_STATUS.FORBIDDEN, true, { permission });
  }
}

/**
 * Organization Access Error (403)
 * Thrown when user tries to access organization resources without permission
 */
export class OrganizationAccessError extends AppError {
  constructor(message: string = "Organization access denied") {
    super(message, ERROR_CODES.ORGANIZATION_ACCESS_DENIED, HTTP_STATUS.FORBIDDEN, true);
  }
}

/**
 * Not Found Error (404)
 * Thrown when a requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource: string = "Resource", id: string | number | null = null) {
    const message = id
      ? `${resource} not found: ${id}`
      : `${resource} not found`;
    super(message, ERROR_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND, true, { resource, id });
  }
}

/**
 * Conflict Error (409)
 * Thrown when a resource already exists or conflicts with current state
 */
export class ConflictError extends AppError {
  constructor(message: string = "Resource conflict", details: ErrorDetails | null = null) {
    super(message, ERROR_CODES.CONFLICT, HTTP_STATUS.CONFLICT, true, details);
  }
}

/**
 * Rate Limit Error (429)
 * Thrown when rate limit is exceeded
 */
export class RateLimitError extends AppError {
  constructor(message: string = "Rate limit exceeded", retryAfter: number | null = null) {
    super(
      message,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      true,
      { retryAfter }
    );
  }
}

interface OriginalError {
  message: string;
  code?: string;
}

/**
 * Database Error (500)
 * Thrown when database operations fail
 */
export class DatabaseError extends AppError {
  constructor(message: string = "Database operation failed", originalError: OriginalError | null = null) {
    const details = originalError ? {
      originalMessage: originalError.message,
      code: originalError.code
    } : null;
    super(message, ERROR_CODES.DATABASE_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, true, details);
  }
}

/**
 * External Service Error (500)
 * Thrown when external API/service calls fail
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string = "External service error", originalError: Error | null = null) {
    const details = {
      service,
      originalMessage: originalError?.message
    };
    super(message, ERROR_CODES.EXTERNAL_SERVICE_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, true, details);
  }
}

/**
 * Configuration Error (500)
 * Thrown when application configuration is invalid or missing
 */
export class ConfigurationError extends AppError {
  constructor(message: string = "Configuration error", configKey: string | null = null) {
    super(
      message,
      ERROR_CODES.CONFIGURATION_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      false, // Configuration errors are not operational - they're programming errors
      { configKey }
    );
  }
}

/**
 * Service Unavailable Error (503)
 * Thrown when a service is temporarily unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = "Service temporarily unavailable", retryAfter: number | null = null) {
    super(
      message,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      true,
      { retryAfter }
    );
  }
}

interface FieldError {
  field: string;
  message: string;
}

/**
 * Helper function to create a ValidationError from field errors
 */
export function createValidationError(fieldErrors: Record<string, string>): ValidationError {
  const errors: FieldError[] = Object.entries(fieldErrors).map(([field, message]) => ({
    field,
    message
  }));
  return new ValidationError("Validation failed", { errors });
}

/**
 * Helper function to determine if an error is operational
 */
export function isOperationalError(error: unknown): boolean {
  return AppError.isOperational(error);
}
