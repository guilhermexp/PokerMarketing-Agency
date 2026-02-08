// ============================================================================
// Content-Type Validation Utility
// ============================================================================
//
// Security: Prevent upload of dangerous file types (HTML, SVG, executables)
// that could enable XSS attacks or code injection when served from Vercel Blob.
//

/**
 * Allowed content types for file uploads.
 *
 * This whitelist prevents upload of dangerous file types including:
 * - text/html (stored XSS)
 * - image/svg+xml (can contain JavaScript)
 * - application/x-msdownload, application/octet-stream (executables)
 * - text/javascript, application/javascript (code injection)
 */
export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "video/mp4",
  "video/webm",
];

/**
 * Validates a content type against the allowed upload types whitelist.
 *
 * @param {string} mimeType - The MIME type to validate (e.g., "image/jpeg")
 * @throws {Error} If the content type is not in the allowed list
 *
 * @example
 * validateContentType("image/jpeg"); // OK
 * validateContentType("text/html"); // throws Error
 */
export function validateContentType(mimeType) {
  if (!mimeType) {
    throw new Error("Content type is required");
  }

  if (!ALLOWED_UPLOAD_CONTENT_TYPES.includes(mimeType)) {
    throw new Error(
      `Invalid content type: ${mimeType}. Allowed types: ${ALLOWED_UPLOAD_CONTENT_TYPES.join(", ")}`
    );
  }
}
