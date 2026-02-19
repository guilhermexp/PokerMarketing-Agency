/**
 * Request Logging Middleware
 *
 * Provides structured logging for all HTTP requests and responses using Pino.
 * - Logs request method, URL, and headers
 * - Logs response status code and duration
 * - Attaches unique request ID to each request
 * - Integrates with global logger configuration
 */

import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import logger from "../lib/logger.mjs";

/**
 * Generate or retrieve request ID
 * @param {Object} req - Express request object
 * @returns {string}
 */
function generateRequestId(req) {
  // Use existing request ID from header if available, otherwise generate new one
  return req.headers["x-request-id"] || randomUUID();
}

/**
 * Determine if we should log this request
 * Skip health checks and other noisy endpoints in production
 * @param {Object} req - Express request object
 * @returns {boolean}
 */
function shouldLogRequest(req) {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const isHealthCheck = req.path === "/api/db/health" || req.path === "/health";

  // In development, log everything
  if (isDevelopment) {
    return true;
  }

  // In production, skip health checks to reduce noise
  return !isHealthCheck;
}

/**
 * Custom request serializer
 * Includes relevant request information without sensitive data
 * @param {Object} req - Express request object
 * @returns {Object}
 */
function customRequestSerializer(req) {
  return {
    id: req.id,
    method: req.method,
    url: req.url,
    query: req.query,
    userId: req.authUserId || req.internalAuth?.userId,
    organizationId: req.authOrgId || req.internalAuth?.orgId || null,
    ip: req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
    userAgent: req.headers["user-agent"],
  };
}

/**
 * Custom response serializer
 * Includes response status and timing information
 * @param {Object} res - Express response object (or serialized version)
 * @returns {Object}
 */
function customResponseSerializer(res) {
  return {
    statusCode: res.statusCode,
  };
}

/**
 * Create pino-http middleware instance
 * This middleware automatically logs all HTTP requests and responses
 */
export const requestLogger = pinoHttp({
  // Use our base logger instance
  logger,

  // Generate unique request ID for each request
  genReqId: generateRequestId,

  // Custom serializers for request and response
  serializers: {
    req: customRequestSerializer,
    res: customResponseSerializer,
  },

  // Customize log message format
  customSuccessMessage: (req, res, responseTime) => {
    const time = responseTime != null ? ` ${Math.round(responseTime)}ms` : "";
    return `${req.method} ${req.url} ${res.statusCode}${time}`;
  },

  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },

  // Custom log level based on response status
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) {
      return "error";
    }
    if (res.statusCode >= 400) {
      return "warn";
    }
    if (res.statusCode === 304) {
      return "debug";
    }
    return "info";
  },

  // Determine whether to log this request
  autoLogging: {
    // Use custom function to determine if we should log
    ignore: (req) => !shouldLogRequest(req),
  },

  // Include response time in logs
  customAttributeKeys: {
    req: "request",
    res: "response",
    err: "error",
    responseTime: "duration",
  },

  // No customReceivedMessage — only log on response completion (cuts 50% of log noise)
});

/**
 * Middleware to attach request ID to the request object
 * This makes the request ID accessible in route handlers
 *
 * Note: This middleware should be used BEFORE requestLogger
 * to ensure the request ID is available when logging
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 *
 * @example
 * app.use(attachRequestId);
 * app.use(requestLogger);
 */
export function attachRequestId(req, res, next) {
  // Generate or retrieve request ID
  req.id = generateRequestId(req);

  // Add request ID to response headers for client-side tracking
  res.setHeader("X-Request-ID", req.id);

  next();
}

/**
 * Create child logger for a specific request
 * Useful for adding request context to logs throughout the request lifecycle
 *
 * @param {Object} req - Express request object
 * @returns {Object} Child logger with request context
 *
 * @example
 * const reqLogger = getRequestLogger(req);
 * reqLogger.info('Processing campaign creation');
 */
export function getRequestLogger(req) {
  return req.log || logger.child({ requestId: req.id });
}
