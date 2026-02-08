// ============================================================================
// Content-Type Validation Utility
// ============================================================================
//
// Security: Prevent upload of dangerous file types (HTML, SVG, executables)
// that could enable XSS attacks or code injection when served from Vercel Blob.
//
// WHY THIS MATTERS:
// ----------------
// Vercel Blob serves uploaded files directly to users' browsers. Without content
// type validation, an attacker could:
//
// 1. Upload malicious HTML files (text/html) containing JavaScript
//    - When a user visits the blob URL, the browser executes the script
//    - This is a Stored XSS attack (script persists on server)
//    - Attacker can steal cookies, session tokens, or redirect users
//
// 2. Upload SVG files (image/svg+xml) with embedded JavaScript
//    - SVG supports <script> tags that execute when rendered
//    - Even seemingly "safe" image formats can execute code
//    - Can bypass Content Security Policy in some cases
//
// 3. Upload executable files (.exe, .msi, .bat, .sh)
//    - Social engineering: trick users into downloading/running malware
//    - Can lead to complete system compromise
//
// 4. Upload JavaScript files (.js) for code injection
//    - If served with text/javascript MIME type, browsers execute them
//    - Can be included in <script src="blob-url"> attacks
//
// DEFENSE STRATEGY:
// ----------------
// We use a WHITELIST (not blacklist) approach:
// - Only explicitly safe MIME types are allowed
// - Whitelist is easier to audit and maintain than blacklist
// - Any new dangerous MIME type is blocked by default
// - Safe types: static images (JPEG, PNG, WebP, GIF) and videos (MP4, WebM)
//

/**
 * Allowed content types for file uploads.
 *
 * SECURITY: This whitelist prevents upload of dangerous file types including:
 * - text/html → Stored XSS (HTML with <script> tags executes in browser)
 * - image/svg+xml → SVG can contain JavaScript in <script> elements
 * - application/x-msdownload, application/octet-stream → Executable malware
 * - text/javascript, application/javascript → Code injection attacks
 *
 * Only static media formats (JPEG, PNG, WebP, HEIC, HEIF, GIF, MP4, WebM) are allowed.
 * These cannot execute code when served directly from Vercel Blob.
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
 * SECURITY: This function prevents XSS and code injection attacks by:
 * 1. Rejecting executable content types (HTML, SVG, JavaScript, executables)
 * 2. Only allowing static media formats that cannot execute code
 * 3. Enforcing exact MIME type matches (case-sensitive, no parameters)
 *
 * This validation MUST be called before ANY file upload to Vercel Blob to prevent
 * attackers from uploading malicious files that could:
 * - Execute JavaScript in users' browsers (Stored XSS)
 * - Distribute malware to application users
 * - Bypass Content Security Policy headers
 *
 * @param {string} mimeType - The MIME type to validate (e.g., "image/jpeg")
 * @throws {Error} If the content type is not in the allowed list
 *
 * @example
 * validateContentType("image/jpeg"); // ✅ OK - static image format
 * validateContentType("text/html"); // ❌ throws Error - prevents Stored XSS
 * validateContentType("image/svg+xml"); // ❌ throws Error - SVG can contain JS
 */
export function validateContentType(mimeType) {
  // SECURITY: Reject missing/empty content types to prevent default MIME type attacks
  // Some browsers might execute unknown types as text/html or text/plain
  if (!mimeType) {
    throw new Error("Content type is required");
  }

  // SECURITY: Whitelist validation prevents upload of dangerous file types
  // Attackers cannot bypass this by using variations (e.g., "TEXT/HTML", "image/svg+xml")
  // because we require exact case-sensitive matches
  if (!ALLOWED_UPLOAD_CONTENT_TYPES.includes(mimeType)) {
    throw new Error(
      `Invalid content type: ${mimeType}. Allowed types: ${ALLOWED_UPLOAD_CONTENT_TYPES.join(", ")}`
    );
  }
}
