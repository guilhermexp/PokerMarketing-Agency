/**
 * Pino Logger Configuration
 *
 * Provides structured logging for the entire application.
 * - Development: Pretty-printed logs for easy reading
 * - Production: JSON logs for log aggregation tools
 */

import pino, { type Logger } from 'pino';

// Determine environment
const isDevelopment = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

// Determine log level based on environment
function getLogLevel(): string {
  if (isTest) return 'silent';
  return process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
}

/**
 * Create logger instance with environment-specific configuration
 */
const logger: Logger = pino({
  // Log level configuration
  level: getLogLevel(),

  // Base configuration
  base: {
    env: process.env.NODE_ENV || 'development',
    pid: process.pid,
  },

  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,

  // Format errors properly with stack traces
  formatters: {
    level: (label) => {
      return { level: label };
    },
    bindings: (bindings) => {
      return {
        pid: bindings.pid,
        hostname: bindings.hostname,
      };
    },
  },

  // Serialize errors to include stack traces
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },

  // Development: Pretty print for human readability
  // Production/Test: JSON for log aggregation
  ...(isDevelopment && !isTest
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname,request,response,duration',
            singleLine: true,
            messageFormat: '{msg}',
            errorLikeObjectKeys: ['err', 'error'],
          },
        },
      }
    : {}),
});

/**
 * Create child logger with additional context
 */
export function createChildLogger(context: Record<string, unknown>): Logger {
  return logger.child(context);
}

/**
 * Log an error with full context
 */
export function logError(error: Error, message: string, context: Record<string, unknown> = {}): void {
  logger.error({
    err: error,
    ...context,
  }, message);
}

/**
 * Log a warning with context
 */
export function logWarning(message: string, context: Record<string, unknown> = {}): void {
  logger.warn(context, message);
}

/**
 * Log an info message with context
 */
export function logInfo(message: string, context: Record<string, unknown> = {}): void {
  logger.info(context, message);
}

/**
 * Log a debug message with context
 */
export function logDebug(message: string, context: Record<string, unknown> = {}): void {
  logger.debug(context, message);
}

export default logger;
