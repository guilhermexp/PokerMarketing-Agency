/**
 * Request Logging Middleware
 *
 * Provides structured logging for all HTTP requests and responses using Pino.
 * - Logs request method, URL, and headers
 * - Logs response status code and duration
 * - Attaches unique request ID to each request
 * - Integrates with global logger configuration
 */

import type { Request, Response, NextFunction, Handler } from "express";
import type { Logger } from "pino";
import type { IncomingMessage, ServerResponse } from "http";
import { pinoHttp } from "pino-http";
import { randomUUID } from "crypto";
import { createChildLogger, rawLogger, type AppLogger } from "../lib/logger.js";

interface SerializedRequest {
  id?: string | number | object;
  method: string;
  url: string;
  query: Record<string, unknown>;
  userId?: string;
  organizationId?: string | null;
  ip?: string;
  userAgent?: string;
}

interface SerializedResponse {
  statusCode: number;
}

interface ConnectionWithRemoteAddress {
  remoteAddress?: string;
}

/**
 * Generate or retrieve request ID
 */
function generateRequestId(req: Request): string {
  // Use existing request ID from header if available, otherwise generate new one
  const xRequestId = req.headers["x-request-id"];
  if (typeof xRequestId === "string") {
    return xRequestId;
  }
  return randomUUID();
}

/**
 * Determine if we should log this request
 * Skip health checks and other noisy endpoints in production
 */
function shouldLogRequest(req: Request): boolean {
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
 */
function customRequestSerializer(req: Request): SerializedRequest {
  const connection = req.connection as ConnectionWithRemoteAddress | undefined;
  const xForwardedFor = req.headers["x-forwarded-for"];
  const ip = req.ip || (typeof xForwardedFor === "string" ? xForwardedFor : undefined) || connection?.remoteAddress;
  const userAgent = req.headers["user-agent"];

  return {
    id: req.id,
    method: req.method,
    url: req.url,
    query: req.query as Record<string, unknown>,
    userId: req.authUserId || req.internalAuth?.userId,
    organizationId: req.authOrgId || req.internalAuth?.orgId || null,
    ip,
    userAgent,
  };
}

/**
 * Custom response serializer
 * Includes response status and timing information
 */
function customResponseSerializer(res: Response): SerializedResponse {
  return {
    statusCode: res.statusCode,
  };
}

/**
 * Create pino-http middleware instance
 * This middleware automatically logs all HTTP requests and responses
 */
export const requestLogger: Handler = pinoHttp({
  // Use our base logger instance
  logger: rawLogger,

  // Generate unique request ID for each request
  genReqId: (req: IncomingMessage) => generateRequestId(req as Request),

  // Custom serializers for request and response
  serializers: {
    req: (req: IncomingMessage) => customRequestSerializer(req as Request),
    res: (res: ServerResponse) => customResponseSerializer(res as unknown as Response),
  },

  // Customize log message format
  customSuccessMessage: (req: IncomingMessage, res: ServerResponse, responseTime: number) => {
    const time = responseTime != null ? ` ${Math.round(responseTime)}ms` : "";
    return `${req.method} ${req.url} ${res.statusCode}${time}`;
  },

  customErrorMessage: (req: IncomingMessage, res: ServerResponse, err: Error) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },

  // Custom log level based on response status
  customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
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
    ignore: (req: IncomingMessage) => !shouldLogRequest(req as Request),
  },

  // Include response time in logs
  customAttributeKeys: {
    req: "request",
    res: "response",
    err: "error",
    responseTime: "duration",
  },

  // No customReceivedMessage — only log on response completion (cuts 50% of log noise)
}) as Handler;

/**
 * Middleware to attach request ID to the request object
 * This makes the request ID accessible in route handlers
 *
 * Note: This middleware should be used BEFORE requestLogger
 * to ensure the request ID is available when logging
 */
export function attachRequestId(req: Request, res: Response, next: NextFunction): void {
  // Generate or retrieve request ID
  req.id = generateRequestId(req);

  // Add request ID to response headers for client-side tracking
  res.setHeader("X-Request-ID", req.id);

  next();
}

/**
 * Create child logger for a specific request
 * Useful for adding request context to logs throughout the request lifecycle
 */
export function getRequestLogger(req: Request): Logger | AppLogger {
  return req.log || createChildLogger({ requestId: req.id });
}
