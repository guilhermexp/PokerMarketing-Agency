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
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

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
} as const;

export type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

export interface ErrorDetails {
  [key: string]: unknown;
}

export interface AppErrorJSON {
  error: {
    name: string;
    message: string;
    code: string;
    statusCode: number;
    timestamp: string;
    details?: ErrorDetails;
    stack?: string;
  };
}

function getDefaultErrorCode(statusCode: number): string {
  switch (statusCode) {
    case HTTP_STATUS.BAD_REQUEST:
      return ERROR_CODES.VALIDATION_ERROR;
    case HTTP_STATUS.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHORIZED;
    case HTTP_STATUS.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case HTTP_STATUS.NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    case HTTP_STATUS.CONFLICT:
      return ERROR_CODES.CONFLICT;
    case HTTP_STATUS.TOO_MANY_REQUESTS:
      return ERROR_CODES.RATE_LIMIT_EXCEEDED;
    case HTTP_STATUS.SERVICE_UNAVAILABLE:
      return ERROR_CODES.SERVICE_UNAVAILABLE;
    default:
      return ERROR_CODES.INTERNAL_SERVER_ERROR;
  }
}

/**
 * Base Application Error
 * All custom errors should extend this class
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly isOperational: boolean;
  readonly details: ErrorDetails | null;
  readonly timestamp: string;

  constructor(message: string, statusCode: number, details?: ErrorDetails | null);
  constructor(
    message: string,
    code?: string,
    statusCode?: number,
    isOperational?: boolean,
    details?: ErrorDetails | null
  );
  constructor(
    message: string,
    codeOrStatus: string | number = ERROR_CODES.INTERNAL_SERVER_ERROR,
    statusCodeOrDetails: number | ErrorDetails | null = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    isOperational: boolean = true,
    details: ErrorDetails | null = null
  ) {
    super(message);

    const normalized =
      typeof codeOrStatus === "number"
        ? {
            code: getDefaultErrorCode(codeOrStatus),
            statusCode: codeOrStatus,
            details:
              typeof statusCodeOrDetails === "number"
                ? details
                : statusCodeOrDetails,
          }
        : {
            code: codeOrStatus,
            statusCode:
              typeof statusCodeOrDetails === "number"
                ? statusCodeOrDetails
                : HTTP_STATUS.INTERNAL_SERVER_ERROR,
            details,
          };

    this.name = this.constructor.name;
    this.code = normalized.code;
    this.statusCode = normalized.statusCode;
    this.isOperational = isOperational;
    this.details = normalized.details ?? null;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for API responses
   */
  toJSON(includeStack: boolean = false): AppErrorJSON {
    const json: AppErrorJSON = {
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
   */
  static isOperational(error: unknown): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }
}
