# Error Handling Verification Guide

## Overview
This document provides comprehensive verification steps for the global error handler with structured logging implementation (subtask-7-1).

## What Was Implemented

### Error Infrastructure Created
1. **Base Error Classes** (`server/lib/errors/AppError.mjs`)
   - AppError base class with statusCode, code, isOperational
   - ERROR_CODES constants (22 error codes)
   - HTTP_STATUS constants

2. **Specific Error Classes** (`server/lib/errors/index.mjs`)
   - ValidationError (400) - Request validation failures
   - AuthError (401) - Authentication failures
   - PermissionDeniedError (403) - Permission/authorization failures
   - OrganizationAccessError (403) - Organization access denied
   - NotFoundError (404) - Resource not found
   - ConflictError (409) - Resource conflicts
   - RateLimitError (429) - Rate limiting
   - DatabaseError (500) - Database operation failures
   - ExternalServiceError (500) - External API failures
   - ConfigurationError (500) - Configuration errors
   - ServiceUnavailableError (503) - Service temporarily unavailable

3. **Error Handler Middleware** (`server/middleware/errorHandler.mjs`)
   - Global error handler middleware
   - 404 not found handler
   - Async handler wrapper
   - Request ID tracking
   - Structured logging with Pino
   - Environment-specific error details

4. **Request Logger Middleware** (`server/middleware/requestLogger.mjs`)
   - Automatic request/response logging
   - Request ID generation
   - Custom serializers for req/res

5. **Structured Logger** (`server/lib/logger.mjs`)
   - Pino-based logger with environment-specific configuration
   - Pretty-printed logs in development
   - JSON logs in production

## Verification Steps

### 1. Start Development Server

```bash
# From project root
bun run dev:api
```

Server should start on `http://localhost:3002` and display structured logs.

### 2. Test 404 Not Found Error

**Test Case 1: Nonexistent Route**
```bash
curl -i http://localhost:3002/api/nonexistent-route
```

**Expected Response:**
- Status: `404 Not Found`
- Header: `X-Request-ID` present
- Body structure:
```json
{
  "error": {
    "name": "AppError",
    "message": "Route not found: GET /api/nonexistent-route",
    "code": "ROUTE_NOT_FOUND",
    "statusCode": 404,
    "requestId": "uuid-format",
    "timestamp": "2026-01-27T...",
    "details": {
      "method": "GET",
      "path": "/api/nonexistent-route"
    },
    "stack": "..." // Only in development
  }
}
```

**Expected Log:**
```
WARN: Client error: Route not found: GET /api/nonexistent-route
  requestId: "uuid"
  method: "GET"
  url: "/api/nonexistent-route"
  code: "ROUTE_NOT_FOUND"
```

**Test Case 2: Resource Not Found**
```bash
curl -i http://localhost:3002/api/db/campaigns/99999999-9999-9999-9999-999999999999
```

**Expected Response:**
- Status: `404 Not Found`
- Error code: `NOT_FOUND`
- Message: Resource-specific not found message

### 3. Test 401 Authentication Error

**Test Case: Missing Authentication**
```bash
curl -i http://localhost:3002/api/db/users
```

**Expected Response:**
- Status: `401 Unauthorized`
- Header: `X-Request-ID` present
- Body structure:
```json
{
  "error": {
    "name": "AuthError",
    "message": "Authentication required",
    "code": "UNAUTHORIZED",
    "statusCode": 401,
    "requestId": "uuid-format",
    "timestamp": "2026-01-27T..."
  }
}
```

**Expected Log:**
```
WARN: Client error: Authentication required
  requestId: "uuid"
  method: "GET"
  url: "/api/db/users"
  code: "UNAUTHORIZED"
```

### 4. Test 403 Permission Denied Error

**Test Case: Insufficient Permissions**

This requires a valid auth token but without proper permissions. The exact test depends on your authentication setup.

**Expected Response:**
- Status: `403 Forbidden`
- Body structure:
```json
{
  "error": {
    "name": "PermissionDeniedError",
    "message": "Permission denied: manage_brand",
    "code": "PERMISSION_DENIED",
    "statusCode": 403,
    "requestId": "uuid-format",
    "timestamp": "2026-01-27T...",
    "details": {
      "permission": "manage_brand"
    }
  }
}
```

**Expected Log:**
```
WARN: Client error: Permission denied: manage_brand
  requestId: "uuid"
  method: "POST"
  url: "/api/db/brand-profiles"
  code: "PERMISSION_DENIED"
```

### 5. Test 400 Validation Error

**Test Case 1: Invalid Request Body**
```bash
curl -i -X POST http://localhost:3002/api/db/users \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'
```

**Expected Response:**
- Status: `400 Bad Request`
- Body structure:
```json
{
  "error": {
    "name": "ValidationError",
    "message": "email and name are required",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "requestId": "uuid-format",
    "timestamp": "2026-01-27T..."
  }
}
```

**Test Case 2: Missing Required Fields**
```bash
curl -i -X POST http://localhost:3002/api/db/brand-profiles \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
- Status: `400 Bad Request`
- Error code: `VALIDATION_ERROR`
- Clear validation error message

**Expected Log:**
```
WARN: Client error: Validation failed
  requestId: "uuid"
  method: "POST"
  url: "/api/db/brand-profiles"
  code: "VALIDATION_ERROR"
  details: { ... }
```

### 6. Test 500 Internal Server Error

**Test Case: Database Error**

Internal server errors are harder to trigger in a controlled way. The error handler should catch unexpected errors and log them appropriately.

**Expected Behavior:**
- Status: `500 Internal Server Error`
- Error message should not expose sensitive information
- Stack trace should NOT be included in production
- Stack trace SHOULD be included in development
- Error should be logged at ERROR level

**Expected Response (Production):**
```json
{
  "error": {
    "name": "DatabaseError",
    "message": "Database operation failed",
    "code": "DATABASE_ERROR",
    "statusCode": 500,
    "requestId": "uuid-format",
    "timestamp": "2026-01-27T..."
    // NO stack trace in production
  }
}
```

**Expected Response (Development):**
```json
{
  "error": {
    "name": "DatabaseError",
    "message": "Database operation failed",
    "code": "DATABASE_ERROR",
    "statusCode": 500,
    "requestId": "uuid-format",
    "timestamp": "2026-01-27T...",
    "stack": "Error: ...\n at ..." // Stack trace included
  }
}
```

**Expected Log:**
```
ERROR: Server error: Database operation failed
  requestId: "uuid"
  method: "GET"
  url: "/api/db/..."
  code: "DATABASE_ERROR"
  err: {
    stack: "..."
  }
```

## Structured Logging Verification

### Check Log Format

1. **Start the dev server** and observe the console output
2. **Make a request** to any endpoint
3. **Verify log structure**:
   - JSON format (in production) or pretty-printed (in development)
   - Includes: level, time, msg, requestId, method, url
   - Includes: userId, organizationId (when authenticated)
   - Includes: statusCode, responseTime

### Example Development Log (Pretty-Printed)
```
[13:45:23] INFO: GET /api/db/health
  requestId: "abc-123-def-456"
  method: "GET"
  url: "/api/db/health"
  statusCode: 200
  responseTime: 45
```

### Example Production Log (JSON)
```json
{
  "level": "info",
  "time": "2026-01-27T13:45:23.123Z",
  "msg": "GET /api/db/health",
  "requestId": "abc-123-def-456",
  "method": "GET",
  "url": "/api/db/health",
  "statusCode": 200,
  "responseTime": 45,
  "env": "production"
}
```

## Automated Test Script

Run the automated test script to verify all error scenarios:

```bash
./test-error-scenarios.sh
```

This script tests:
- 404 Not Found (route and resource)
- 401 Authentication Error
- 403 Permission Denied Error
- 400 Validation Error (multiple cases)
- Verifies error response structure
- Checks for requestId and X-Request-ID header

## Manual Verification Checklist

- [ ] Server starts with structured logs appearing
- [ ] 404 errors return consistent format with requestId
- [ ] 401 authentication errors have helpful messages
- [ ] 403 permission errors use PermissionDeniedError class
- [ ] 400 validation errors have clear error details
- [ ] 500 internal errors are logged (check server console)
- [ ] Stack traces appear ONLY in development mode
- [ ] All error responses include X-Request-ID header
- [ ] All error responses have consistent JSON structure
- [ ] Logs are in JSON format in production
- [ ] Logs are pretty-printed in development

## Success Criteria

✅ **All error responses must include:**
- `error.name`
- `error.message`
- `error.code`
- `error.statusCode`
- `error.requestId`
- `error.timestamp`
- `X-Request-ID` header

✅ **Logging must include:**
- Request ID for correlation
- HTTP method and URL
- User ID and Organization ID (when available)
- Error context and details
- Stack traces (development only)
- Appropriate log levels (warn for 4xx, error for 5xx)

✅ **Environment-specific behavior:**
- Development: Stack traces included, pretty logs
- Production: No stack traces, JSON logs, no sensitive data

## Troubleshooting

### Issue: Logs not appearing
- Check `NODE_ENV` environment variable
- Check `LOG_LEVEL` environment variable
- Verify Pino dependencies are installed (`bun install`)

### Issue: Stack traces in production
- Verify `NODE_ENV=production` is set
- Check `shouldIncludeStack()` function in errorHandler.mjs

### Issue: RequestId missing
- Verify requestLogger middleware is registered before routes
- Check that middleware is in correct order

### Issue: Error not caught
- Verify errorHandler is registered LAST in middleware chain
- Use asyncHandler wrapper for async route handlers
- Check that error is being thrown (not just returned)

## Additional Notes

- All console.log/error/warn statements have been replaced with logger calls
- Error handler catches both AppError instances and generic errors
- Non-operational errors (programming errors) are logged as FATAL
- Request IDs enable correlation between requests and error logs
- Error details are sanitized in production to avoid information disclosure
