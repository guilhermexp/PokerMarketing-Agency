/**
 * Application Error Classes
 * Specific error types for common error scenarios
 */

import { AppError, ERROR_CODES, HTTP_STATUS } from "./AppError.mjs";

// Re-export base error and constants
export { AppError, ERROR_CODES, HTTP_STATUS };

/**
 * Validation Error (400)
 * Thrown when request data fails validation
 */
export class ValidationError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object|Array} details - Validation error details (field errors, etc.)
   */
  constructor(message = "Validation failed", details = null) {
    super(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, true, details);
  }
}

/**
 * Authentication Error (401)
 * Thrown when authentication fails or is missing
 */
export class AuthError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {string} code - Specific auth error code
   */
  constructor(message = "Authentication required", code = ERROR_CODES.UNAUTHORIZED) {
    super(message, code, HTTP_STATUS.UNAUTHORIZED, true);
  }
}

/**
 * Permission Denied Error (403)
 * Thrown when user lacks required permissions
 */
export class PermissionDeniedError extends AppError {
  /**
   * @param {string} permission - Required permission that was missing
   */
  constructor(permission) {
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
  /**
   * @param {string} message - Error message
   */
  constructor(message = "Organization access denied") {
    super(message, ERROR_CODES.ORGANIZATION_ACCESS_DENIED, HTTP_STATUS.FORBIDDEN, true);
  }
}

/**
 * Not Found Error (404)
 * Thrown when a requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  /**
   * @param {string} resource - Name of the resource that wasn't found
   * @param {string|number} id - ID of the resource (optional)
   */
  constructor(resource = "Resource", id = null) {
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
  /**
   * @param {string} message - Error message
   * @param {Object} details - Conflict details
   */
  constructor(message = "Resource conflict", details = null) {
    super(message, ERROR_CODES.CONFLICT, HTTP_STATUS.CONFLICT, true, details);
  }
}

/**
 * Rate Limit Error (429)
 * Thrown when rate limit is exceeded
 */
export class RateLimitError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {number} retryAfter - Seconds until retry is allowed
   */
  constructor(message = "Rate limit exceeded", retryAfter = null) {
    super(
      message,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      true,
      { retryAfter }
    );
  }
}

/**
 * Database Error (500)
 * Thrown when database operations fail
 */
export class DatabaseError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Error} originalError - Original database error
   */
  constructor(message = "Database operation failed", originalError = null) {
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
  /**
   * @param {string} service - Name of the external service
   * @param {string} message - Error message
   * @param {Error} originalError - Original error from service
   */
  constructor(service, message = "External service error", originalError = null) {
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
  /**
   * @param {string} message - Error message
   * @param {string} configKey - Configuration key that's missing/invalid
   */
  constructor(message = "Configuration error", configKey = null) {
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
  /**
   * @param {string} message - Error message
   * @param {number} retryAfter - Seconds until service might be available
   */
  constructor(message = "Service temporarily unavailable", retryAfter = null) {
    super(
      message,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      true,
      { retryAfter }
    );
  }
}

/**
 * Helper function to create a ValidationError from field errors
 * @param {Object} fieldErrors - Object mapping field names to error messages
 * @returns {ValidationError}
 */
export function createValidationError(fieldErrors) {
  const errors = Object.entries(fieldErrors).map(([field, message]) => ({
    field,
    message
  }));
  return new ValidationError("Validation failed", { errors });
}

/**
 * Helper function to determine if an error is operational
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
export function isOperationalError(error) {
  return AppError.isOperational(error);
}
