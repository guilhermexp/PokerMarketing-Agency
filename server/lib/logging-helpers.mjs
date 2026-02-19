/**
 * Logging helper functions for external API calls.
 */

import logger from "./logger.mjs";

export function logExternalAPI(service, action, details = "") {
  logger.debug(
    { service, action, details: details || undefined },
    `[${service}] ${action}${details ? ` ${details}` : ""}`,
  );
}

export function logExternalAPIResult(service, action, duration, success = true) {
  logger.debug(
    { service, action, durationMs: duration, success },
    `[${service}] ${success ? "✓" : "✗"} ${action}`,
  );
}

export function logError(context, error) {
  logger.error({ err: error, context }, `ERROR: ${context}`);
  logger.error({ message: error.message }, `Message: ${error.message}`);
  if (error.stack) {
    logger.error({ stack: error.stack }, "Stack trace");
  }
  if (error.response?.data) {
    logger.error({ responseData: error.response.data }, "Response data");
  }
}
