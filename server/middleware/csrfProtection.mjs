/**
 * CSRF Protection Middleware
 *
 * Implements Double Submit Cookie pattern for CSRF protection.
 * - Generates CSRF tokens for safe HTTP methods (GET, HEAD, OPTIONS)
 * - Validates CSRF tokens for unsafe methods (POST, PUT, DELETE, PATCH)
 * - Sets httpOnly cookie with CSRF token
 * - Returns token in X-CSRF-Token response header
 *
 * Security:
 * - Tokens are cryptographically random (crypto.randomBytes)
 * - Validation uses HMAC to prevent forgery
 * - Cookies are httpOnly to prevent XSS
 * - Cookies use sameSite to prevent cross-site attacks
 */

import { generateCsrfToken, validateCsrfToken } from "../lib/csrf.mjs";
import { AppError, ERROR_CODES, HTTP_STATUS } from "../lib/errors/index.mjs";
import logger from "../lib/logger.mjs";

// Cookie name for CSRF token
const CSRF_COOKIE_NAME = "csrf_token";

// Header name for CSRF token
const CSRF_HEADER_NAME = "x-csrf-token";

// Safe HTTP methods that don't require CSRF protection
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF Token Validation Error (403)
 * Thrown when CSRF token is missing or invalid
 */
class CsrfError extends AppError {
  /**
   * @param {string} message - Error message
   */
  constructor(message = "CSRF token validation failed") {
    super(message, ERROR_CODES.FORBIDDEN, HTTP_STATUS.FORBIDDEN, true);
  }
}

/**
 * Get CSRF token from request cookie
 * @param {Object} req - Express request object
 * @returns {string|null}
 */
function getTokenFromCookie(req) {
  return req.cookies?.[CSRF_COOKIE_NAME] || null;
}

/**
 * Get CSRF token from request header
 * @param {Object} req - Express request object
 * @returns {string|null}
 */
function getTokenFromHeader(req) {
  return req.headers[CSRF_HEADER_NAME] || req.headers[CSRF_HEADER_NAME.toLowerCase()] || null;
}

/**
 * Set CSRF token cookie
 * @param {Object} res - Express response object
 * @param {string} token - CSRF token
 */
function setTokenCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: true, // Prevent XSS attacks
    secure: isProduction, // HTTPS only in production
    sameSite: "strict", // Prevent cross-site requests
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: "/", // Cookie available for all paths
  });
}

/**
 * Determine if request requires CSRF protection
 * @param {Object} req - Express request object
 * @returns {boolean}
 */
function requiresCsrfProtection(req) {
  // Safe methods don't require CSRF protection
  if (SAFE_METHODS.has(req.method)) {
    return false;
  }

  // All state-changing methods require CSRF protection
  return true;
}

/**
 * Log CSRF validation failure
 * @param {Object} req - Express request object
 * @param {string} reason - Reason for failure
 */
function logCsrfFailure(req, reason) {
  logger.warn(
    {
      requestId: req.id,
      method: req.method,
      url: req.url,
      userId: req.authUserId || req.internalAuth?.userId,
      organizationId: req.authOrgId || req.internalAuth?.orgId || null,
      ip: req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
      reason,
    },
    `CSRF validation failed: ${reason}`
  );
}

/**
 * CSRF Protection Middleware
 *
 * For safe methods (GET, HEAD, OPTIONS):
 * - Generates a new CSRF token if one doesn't exist
 * - Sets the token in a cookie
 * - Includes the token in X-CSRF-Token response header
 *
 * For unsafe methods (POST, PUT, DELETE, PATCH):
 * - Validates that the CSRF token from header matches cookie
 * - Throws CsrfError (403) if validation fails
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 *
 * @example
 * // Apply to all routes
 * app.use(csrfProtection);
 *
 * @example
 * // Apply to specific routes
 * app.use('/api/db/*', csrfProtection);
 */
export function csrfProtection(req, res, next) {
  try {
    const method = req.method;

    // For safe methods, generate and set token
    if (!requiresCsrfProtection(req)) {
      // Get existing token from cookie or generate new one
      let token = getTokenFromCookie(req);

      if (!token) {
        // Generate new token
        token = generateCsrfToken();
        logger.debug(
          { requestId: req.id, method, url: req.url },
          "Generated new CSRF token"
        );
      }

      // Set token in cookie
      setTokenCookie(res, token);

      // Include token in response header for client-side access
      res.setHeader("X-CSRF-Token", token);

      // Store token on request object for access in route handlers
      req.csrfToken = token;

      return next();
    }

    // For unsafe methods, validate token
    const cookieToken = getTokenFromCookie(req);
    const headerToken = getTokenFromHeader(req);

    // Check if tokens are present
    if (!cookieToken) {
      logCsrfFailure(req, "Missing CSRF cookie");
      throw new CsrfError("CSRF token missing from cookie");
    }

    if (!headerToken) {
      logCsrfFailure(req, "Missing CSRF header");
      throw new CsrfError("CSRF token missing from request header");
    }

    // Validate that header token matches cookie token
    if (cookieToken !== headerToken) {
      logCsrfFailure(req, "CSRF token mismatch");
      throw new CsrfError("CSRF token mismatch");
    }

    // Validate token signature
    if (!validateCsrfToken(cookieToken)) {
      logCsrfFailure(req, "Invalid CSRF token signature");
      throw new CsrfError("Invalid CSRF token");
    }

    // Token is valid, store on request and continue
    req.csrfToken = cookieToken;

    logger.debug(
      { requestId: req.id, method, url: req.url },
      "CSRF token validated successfully"
    );

    next();
  } catch (error) {
    // Pass error to error handler middleware
    next(error);
  }
}

/**
 * Middleware to skip CSRF protection for specific routes
 * Use this for routes that don't need CSRF protection (e.g., webhooks)
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 *
 * @example
 * app.post('/api/webhooks/stripe', skipCsrfProtection, handleStripeWebhook);
 */
export function skipCsrfProtection(req, res, next) {
  req.skipCsrfProtection = true;
  next();
}

/**
 * Conditional CSRF protection wrapper
 * Skips CSRF if req.skipCsrfProtection is set
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function conditionalCsrfProtection(req, res, next) {
  if (req.skipCsrfProtection) {
    return next();
  }
  return csrfProtection(req, res, next);
}
