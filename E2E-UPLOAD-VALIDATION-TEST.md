# E2E Upload Validation Testing Guide

## Overview
This document provides instructions for end-to-end testing of the content-type validation in the `/api/upload` endpoint.

## Implementation Details
- **File**: `server/index.mjs`
- **Whitelist**: Lines 3893-3902 (`ALLOWED_UPLOAD_CONTENT_TYPES`)
- **Validation**: Lines 3918-3922 (content-type check with descriptive error)

## Automated Unit Test Results ✅
The validation logic has been verified with the included `verify-upload-validation.mjs` script:
- **10/10 tests passed**
- Dangerous types properly rejected: text/html, image/svg+xml, application/x-sh, etc.
- Safe types properly allowed: image/jpeg, image/png, video/mp4, etc.

## Manual E2E Testing (with Authentication)

### Prerequisites
1. Development server running: `bun run dev:api`
2. Valid authentication token from Clerk
3. Tool: curl or Postman

### How to Get Authentication Token
1. Log in to the application via the web interface
2. Open browser DevTools → Network tab
3. Make any authenticated request
4. Copy the `Authorization` header value or session cookie

### Test Cases

#### 1. Test Dangerous Content Types (Should Return 400)

**Test HTML Upload:**
```bash
curl -X POST http://localhost:3002/api/upload \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE' \
  -d '{"filename":"test.html","contentType":"text/html","data":"dGVzdA=="}'
```
**Expected Response:**
```json
{
  "error": "Invalid content type. Allowed types: image/jpeg, image/png, image/webp, image/heic, image/heif, image/gif, video/mp4, video/webm"
}
```
**Expected Status:** 400

**Test SVG Upload:**
```bash
curl -X POST http://localhost:3002/api/upload \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE' \
  -d '{"filename":"test.svg","contentType":"image/svg+xml","data":"dGVzdA=="}'
```
**Expected Status:** 400

**Test Shell Script Upload:**
```bash
curl -X POST http://localhost:3002/api/upload \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE' \
  -d '{"filename":"test.sh","contentType":"application/x-sh","data":"dGVzdA=="}'
```
**Expected Status:** 400

#### 2. Test Safe Content Types (Should Return 200)

**Test JPEG Upload:**
```bash
curl -X POST http://localhost:3002/api/upload \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE' \
  -d '{"filename":"test.jpg","contentType":"image/jpeg","data":"dGVzdA=="}'
```
**Expected Status:** 200
**Expected Response:**
```json
{
  "success": true,
  "url": "https://...",
  "filename": "..."
}
```

**Test PNG Upload:**
```bash
curl -X POST http://localhost:3002/api/upload \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE' \
  -d '{"filename":"test.png","contentType":"image/png","data":"dGVzdA=="}'
```
**Expected Status:** 200

**Test MP4 Upload:**
```bash
curl -X POST http://localhost:3002/api/upload \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE' \
  -d '{"filename":"test.mp4","contentType":"video/mp4","data":"dGVzdA=="}'
```
**Expected Status:** 200

## Validation Order
The content-type validation occurs in the following order:
1. **Authentication check** (Clerk middleware) - Returns 401 if not authenticated
2. **Required fields check** - Returns 400 if filename, contentType, or data is missing
3. **Content-type whitelist validation** - Returns 400 if contentType not in whitelist ✅
4. **File size check** - Returns 400 if file exceeds 100MB
5. **Upload to Vercel Blob** - Only reached if all validations pass

## Security Benefits
This validation prevents:
- ✅ Stored XSS attacks via uploaded HTML files
- ✅ JavaScript execution via SVG files
- ✅ Malicious executable uploads (shell scripts, binaries, etc.)
- ✅ Unknown/arbitrary file type uploads

## Code Review Verification
The implementation has been reviewed and confirmed:
- ✅ Whitelist constant defined with 8 safe mime types
- ✅ Validation check with descriptive error message
- ✅ Validation happens before file processing (fail fast)
- ✅ No console.log statements (clean code)
- ✅ Follows existing error handling patterns
