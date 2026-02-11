/**
 * Pino Logger Configuration
 *
 * Provides structured logging for the entire application.
 * - Development: Pretty-printed logs for easy reading
 * - Production: JSON logs for log aggregation tools
 */

import pino from 'pino';

// Determine environment
const isDevelopment = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Create logger instance with environment-specific configuration
 */
const logger = pino({
  // Log level configuration
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

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
  // Production: JSON for log aggregation
  // Test: Silent or minimal output
  ...(isTest
    ? { level: 'silent' }
    : isDevelopment
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
 * @param {Object} context - Additional context to include in all logs
 * @returns {pino.Logger}
 *
 * @example
 * const reqLogger = createChildLogger({ requestId: 'abc-123' });
 * reqLogger.info('Processing request');
 */
export function createChildLogger(context) {
  return logger.child(context);
}

/**
 * Log an error with full context
 * @param {Error} error - Error object
 * @param {string} message - Additional message
 * @param {Object} context - Additional context
 *
 * @example
 * logError(err, 'Failed to process campaign', { campaignId: 123 });
 */
export function logError(error, message, context = {}) {
  logger.error({
    err: error,
    ...context,
  }, message);
}

/**
 * Log a warning with context
 * @param {string} message - Warning message
 * @param {Object} context - Additional context
 *
 * @example
 * logWarning('Rate limit approaching', { userId: 'user_123', current: 95, limit: 100 });
 */
export function logWarning(message, context = {}) {
  logger.warn(context, message);
}

/**
 * Log an info message with context
 * @param {string} message - Info message
 * @param {Object} context - Additional context
 *
 * @example
 * logInfo('Campaign created', { campaignId: 123, userId: 'user_123' });
 */
export function logInfo(message, context = {}) {
  logger.info(context, message);
}

/**
 * Log a debug message with context
 * @param {string} message - Debug message
 * @param {Object} context - Additional context
 *
 * @example
 * logDebug('Database query executed', { query: 'SELECT * FROM campaigns', duration: 45 });
 */
export function logDebug(message, context = {}) {
  logger.debug(context, message);
}

export default logger;
