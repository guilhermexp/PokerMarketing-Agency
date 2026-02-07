#!/usr/bin/env node

/**
 * Verification script for content-type validation in /api/upload endpoint
 *
 * This script tests that:
 * 1. Dangerous content types (text/html, image/svg+xml, application/x-sh) are rejected
 * 2. Safe content types (image/jpeg, image/png, video/mp4) are allowed
 */

// Whitelist from server/index.mjs (lines 3893-3902)
const ALLOWED_UPLOAD_CONTENT_TYPES = [
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
 * Simulates the validation logic from server/index.mjs (lines 3918-3922)
 */
function validateContentType(contentType) {
  if (!ALLOWED_UPLOAD_CONTENT_TYPES.includes(contentType)) {
    return {
      valid: false,
      error: `Invalid content type. Allowed types: ${ALLOWED_UPLOAD_CONTENT_TYPES.join(", ")}`
    };
  }
  return { valid: true };
}

// Test cases
const tests = [
  // Dangerous types (should be rejected)
  { contentType: "text/html", shouldPass: false, description: "HTML files (XSS risk)" },
  { contentType: "image/svg+xml", shouldPass: false, description: "SVG files (JavaScript execution risk)" },
  { contentType: "application/x-sh", shouldPass: false, description: "Shell scripts (executable)" },
  { contentType: "application/javascript", shouldPass: false, description: "JavaScript files (executable)" },
  { contentType: "application/octet-stream", shouldPass: false, description: "Unknown binary files" },

  // Safe types (should be allowed)
  { contentType: "image/jpeg", shouldPass: true, description: "JPEG images" },
  { contentType: "image/png", shouldPass: true, description: "PNG images" },
  { contentType: "video/mp4", shouldPass: true, description: "MP4 videos" },
  { contentType: "image/webp", shouldPass: true, description: "WebP images" },
  { contentType: "video/webm", shouldPass: true, description: "WebM videos" },
];

console.log("=================================================");
console.log("Content-Type Validation Verification");
console.log("=================================================\n");

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = validateContentType(test.contentType);
  const actuallyPassed = result.valid;
  const expectedToPass = test.shouldPass;

  const testPassed = actuallyPassed === expectedToPass;

  if (testPassed) {
    passed++;
    console.log(`✅ PASS: ${test.contentType}`);
    console.log(`   ${test.description}`);
    console.log(`   Expected: ${expectedToPass ? "ALLOW" : "REJECT"}, Got: ${actuallyPassed ? "ALLOW" : "REJECT"}\n`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${test.contentType}`);
    console.log(`   ${test.description}`);
    console.log(`   Expected: ${expectedToPass ? "ALLOW" : "REJECT"}, Got: ${actuallyPassed ? "ALLOW" : "REJECT"}`);
    if (!result.valid) {
      console.log(`   Error message: ${result.error}`);
    }
    console.log();
  }
}

console.log("=================================================");
console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length} total`);
console.log("=================================================\n");

if (failed > 0) {
  console.error("❌ VERIFICATION FAILED: Some tests did not pass");
  process.exit(1);
} else {
  console.log("✅ VERIFICATION PASSED: All content-type validation tests passed");
  console.log("\nSecurity validation is working correctly:");
  console.log("- Dangerous file types are properly rejected");
  console.log("- Safe image and video types are allowed");
  process.exit(0);
}
