/**
 * Logging helper functions for external API calls.
 */

import logger from "./logger.js";

export function logExternalAPI(service: string, action: string, details: string = ""): void {
  logger.debug(
    { service, action, details: details || undefined },
    `[${service}] ${action}${details ? ` ${details}` : ""}`,
  );
}

export function logExternalAPIResult(
  service: string,
  action: string,
  duration: number,
  success: boolean = true
): void {
  logger.debug(
    { service, action, durationMs: duration, success },
    `[${service}] ${success ? "✓" : "✗"} ${action}`,
  );
}

interface ErrorWithResponse extends Error {
  response?: {
    data?: unknown;
  };
}

export function logError(context: string, error: Error): void {
  logger.error({ err: error, context }, `ERROR: ${context}`);
  logger.error({ message: error.message }, `Message: ${error.message}`);
  if (error.stack) {
    logger.error({ stack: error.stack }, "Stack trace");
  }
  const errorWithResponse = error as ErrorWithResponse;
  if (errorWithResponse.response?.data) {
    logger.error({ responseData: errorWithResponse.response.data }, "Response data");
  }
}
