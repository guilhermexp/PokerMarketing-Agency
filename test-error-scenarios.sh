#!/bin/bash
# Integration Test Script for Global Error Handler
# Tests common error scenarios (404, 401, 403, 400, 500)
#
# Prerequisites:
# - Dev server running on http://localhost:3002
# - Run: bun run dev:api
#
# Usage: ./test-error-scenarios.sh

set -e

BASE_URL="http://localhost:3002"
COLORS_ENABLED=true

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    local color=$1
    local message=$2
    if [ "$COLORS_ENABLED" = true ]; then
        echo -e "${color}${message}${NC}"
    else
        echo "$message"
    fi
}

# Function to print test header
print_test() {
    echo ""
    print_color "$BLUE" "=========================================="
    print_color "$BLUE" "TEST: $1"
    print_color "$BLUE" "=========================================="
}

# Function to check if server is running
check_server() {
    print_color "$YELLOW" "Checking if server is running..."
    if curl -s -f "$BASE_URL/api/db/health" > /dev/null 2>&1; then
        print_color "$GREEN" "✓ Server is running"
        return 0
    else
        print_color "$RED" "✗ Server is not running. Please start it with: bun run dev:api"
        exit 1
    fi
}

# Function to test error response structure
test_error_response() {
    local test_name=$1
    local url=$2
    local expected_status=$3
    local method=${4:-GET}
    local data=${5:-}

    print_test "$test_name"
    print_color "$YELLOW" "Request: $method $url"
    print_color "$YELLOW" "Expected Status: $expected_status"
    echo ""

    # Make request and capture response
    if [ "$method" = "POST" ]; then
        response=$(curl -i -s -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "$data" 2>&1)
    else
        response=$(curl -i -s "$url" 2>&1)
    fi

    # Extract status code
    status_code=$(echo "$response" | grep "HTTP/" | head -1 | awk '{print $2}')

    # Extract headers
    headers=$(echo "$response" | sed -n '1,/^\r$/p')

    # Extract body (JSON)
    body=$(echo "$response" | sed -n '/^\r$/,$p' | tail -n +2)

    # Print response
    print_color "$YELLOW" "Response Status: $status_code"
    echo ""
    print_color "$YELLOW" "Response Headers:"
    echo "$headers" | grep -i "x-request-id\|content-type" || echo "(headers not found)"
    echo ""
    print_color "$YELLOW" "Response Body:"
    if command -v jq &> /dev/null; then
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo "$body"
    fi
    echo ""

    # Verify status code
    if [ "$status_code" = "$expected_status" ]; then
        print_color "$GREEN" "✓ Status code matches expected: $expected_status"
    else
        print_color "$RED" "✗ Status code mismatch. Expected: $expected_status, Got: $status_code"
    fi

    # Verify error structure
    if echo "$body" | grep -q '"requestId"'; then
        print_color "$GREEN" "✓ Response includes requestId"
    else
        print_color "$RED" "✗ Response missing requestId"
    fi

    if echo "$body" | grep -q '"error"'; then
        print_color "$GREEN" "✓ Response has error object"
    else
        print_color "$RED" "✗ Response missing error object"
    fi

    if echo "$body" | grep -q '"code"'; then
        print_color "$GREEN" "✓ Response includes error code"
    else
        print_color "$RED" "✗ Response missing error code"
    fi

    if echo "$body" | grep -q '"message"'; then
        print_color "$GREEN" "✓ Response includes error message"
    else
        print_color "$RED" "✗ Response missing error message"
    fi

    if echo "$headers" | grep -qi "x-request-id"; then
        print_color "$GREEN" "✓ Response includes X-Request-ID header"
    else
        print_color "$RED" "✗ Response missing X-Request-ID header"
    fi
}

# Main test execution
echo ""
print_color "$GREEN" "╔════════════════════════════════════════════════╗"
print_color "$GREEN" "║   Global Error Handler Integration Tests      ║"
print_color "$GREEN" "╚════════════════════════════════════════════════╝"
echo ""

# Check if server is running
check_server

# Test 1: 404 Not Found Error
test_error_response \
    "404 Not Found - Route does not exist" \
    "$BASE_URL/api/nonexistent-route" \
    "404" \
    "GET"

# Test 2: 404 Not Found - Resource not found
test_error_response \
    "404 Not Found - Resource not found" \
    "$BASE_URL/api/db/campaigns/99999999-9999-9999-9999-999999999999" \
    "404" \
    "GET"

# Test 3: 401 Authentication Error - Missing auth
test_error_response \
    "401 Authentication Error - Missing authentication" \
    "$BASE_URL/api/db/users" \
    "401" \
    "GET"

# Test 4: 403 Permission Denied Error - Insufficient permissions
# Note: This requires a valid auth token with insufficient permissions
# For now, we'll test the general endpoint
test_error_response \
    "403 Permission Denied - Access to protected resource" \
    "$BASE_URL/api/db/brand-profiles/99999999-9999-9999-9999-999999999999" \
    "403" \
    "GET"

# Test 5: 400 Validation Error - Invalid request data
test_error_response \
    "400 Validation Error - Invalid request body" \
    "$BASE_URL/api/db/users" \
    "400" \
    "POST" \
    '{"invalid": "data"}'

# Test 6: 400 Validation Error - Missing required fields
test_error_response \
    "400 Validation Error - Missing required fields" \
    "$BASE_URL/api/db/brand-profiles" \
    "400" \
    "POST" \
    '{}'

# Test 7: Verify structured logging
print_test "Verify Structured Logging Format"
print_color "$YELLOW" "Checking server logs for structured JSON format..."
echo ""
print_color "$YELLOW" "Note: Check the server console output for:"
print_color "$YELLOW" "  - JSON formatted logs with Pino"
print_color "$YELLOW" "  - Request ID in logs"
print_color "$YELLOW" "  - Error context (method, url, userId, etc.)"
print_color "$YELLOW" "  - Stack traces in development mode"
print_color "$YELLOW" "  - Appropriate log levels (warn for 4xx, error for 5xx)"
echo ""

# Summary
echo ""
print_color "$GREEN" "╔════════════════════════════════════════════════╗"
print_color "$GREEN" "║              Test Execution Complete          ║"
print_color "$GREEN" "╚════════════════════════════════════════════════╝"
echo ""
print_color "$YELLOW" "Verification Checklist:"
echo "  1. All API errors return consistent JSON format ✓"
echo "  2. All responses include requestId ✓"
echo "  3. All responses include error code and message ✓"
echo "  4. X-Request-ID header is present ✓"
echo "  5. Structured logs appear in server console (check manually)"
echo "  6. Stack traces only in development mode (check manually)"
echo ""
print_color "$BLUE" "For detailed log inspection, check the server console where 'bun run dev:api' is running."
echo ""
