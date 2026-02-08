/**
 * Base Application Error Class
 * Provides consistent error handling with error codes and HTTP status codes
 */

/**
 * Error codes for different types of application errors
 */
export const ERROR_CODES = {
  // Validation Errors (400)
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",

  // Authentication Errors (401)
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED",

  // Authorization Errors (403)
  FORBIDDEN: "FORBIDDEN",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  ORGANIZATION_ACCESS_DENIED: "ORGANIZATION_ACCESS_DENIED",

  // Not Found Errors (404)
  NOT_FOUND: "NOT_FOUND",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",

  // Conflict Errors (409)
  CONFLICT: "CONFLICT",
  DUPLICATE_RESOURCE: "DUPLICATE_RESOURCE",

  // Rate Limiting (429)
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",

  // Server Errors (500)
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",

  // Service Unavailable (503)
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
};

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Base Application Error
 * All custom errors should extend this class
 */
export class AppError extends Error {
  /**
   * Create a new application error
   * @param {string} message - Human-readable error message
   * @param {string} code - Error code from ERROR_CODES
   * @param {number} statusCode - HTTP status code from HTTP_STATUS
   * @param {boolean} isOperational - Whether this is an operational error (expected) vs programming error (bug)
   * @param {Object} details - Additional error details (validation errors, context, etc.)
   */
  constructor(
    message,
    code = ERROR_CODES.INTERNAL_SERVER_ERROR,
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    isOperational = true,
    details = null
  ) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for API responses
   * @param {boolean} includeStack - Whether to include stack trace (dev only)
   * @returns {Object}
   */
  toJSON(includeStack = false) {
    const json = {
      error: {
        name: this.name,
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        timestamp: this.timestamp,
      },
    };

    if (this.details) {
      json.error.details = this.details;
    }

    if (includeStack && this.stack) {
      json.error.stack = this.stack;
    }

    return json;
  }

  /**
   * Check if this is an operational error
   * @returns {boolean}
   */
  static isOperational(error) {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }
}
