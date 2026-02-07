#!/usr/bin/env node

/**
 * Test Script: Oversized Payload Rejection
 *
 * Purpose: Verify that the 10MB JSON body size limit properly rejects oversized payloads
 *
 * Test Cases:
 * 1. Send 11MB payload (slightly over limit)
 * 2. Send 50MB payload (significantly over limit)
 * 3. Verify 413 Payload Too Large status code
 * 4. Verify error message is clear and informative
 */

import http from 'http';

// ANSI color codes for readable output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

const SERVER_URL = 'http://localhost:3002';
const TEST_ENDPOINT = '/api/db/campaigns'; // Using campaigns endpoint for realistic test

/**
 * Generate a JSON payload of specified size
 * @param {number} sizeMB - Target size in megabytes
 * @returns {string} JSON string
 */
function generateOversizedPayload(sizeMB) {
  const targetBytes = sizeMB * 1024 * 1024;

  // Create large array of strings to reach target size
  const sampleText = "This is sample padding data to create an oversized payload for security testing. ".repeat(100);
  const paddingArray = [];

  let currentSize = 0;
  while (currentSize < targetBytes) {
    paddingArray.push(sampleText);
    currentSize += sampleText.length;
  }

  const payload = {
    name: "Oversized Test Campaign",
    transcript: "Test transcript",
    video_clips: paddingArray.map((text, i) => ({
      title: `Clip ${i}`,
      script: text,
      scenes: [{ description: text }]
    })),
    organization_id: "test-org-id"
  };

  return JSON.stringify(payload);
}

/**
 * Send HTTP POST request with oversized payload
 * @param {string} payload - JSON payload string
 * @param {number} sizeMB - Size in MB (for display)
 * @returns {Promise<Object>} Response data
 */
function sendOversizedRequest(payload, sizeMB) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3002,
      path: TEST_ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: data,
          sizeMB: sizeMB
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    // Write payload in chunks to avoid memory issues
    const chunkSize = 64 * 1024; // 64KB chunks
    for (let i = 0; i < payload.length; i += chunkSize) {
      req.write(payload.slice(i, i + chunkSize));
    }
    req.end();
  });
}

/**
 * Verify response is correct 413 error
 * @param {Object} response - HTTP response
 * @returns {Object} Verification result
 */
function verifyRejection(response) {
  const checks = {
    statusCode: {
      expected: 413,
      actual: response.statusCode,
      passed: response.statusCode === 413
    },
    statusMessage: {
      expected: 'Payload Too Large',
      actual: response.statusMessage,
      passed: response.statusMessage === 'Payload Too Large'
    },
    hasErrorMessage: {
      expected: 'Error message present',
      actual: response.body.length > 0 ? 'Yes' : 'No',
      passed: response.body.length > 0
    }
  };

  // Try to parse error message
  let errorMessage = null;
  try {
    const parsed = JSON.parse(response.body);
    // Handle nested error object structure
    if (parsed.error && typeof parsed.error === 'object') {
      errorMessage = parsed.error.message || JSON.stringify(parsed.error);
    } else {
      errorMessage = parsed.error || parsed.message || null;
    }
  } catch (e) {
    errorMessage = response.body;
  }

  checks.errorMessage = {
    expected: 'Clear error message',
    actual: errorMessage,
    passed: errorMessage && errorMessage.length > 0
  };

  const allPassed = Object.values(checks).every(check => check.passed);

  return { checks, allPassed, errorMessage };
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

/**
 * Main test execution
 */
async function runTests() {
  console.log(`${colors.bold}${colors.blue}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}║  OVERSIZED PAYLOAD REJECTION TEST                              ║${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}║  Security Validation: DoS Prevention via 10MB JSON Limit      ║${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}╚════════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log();

  const testCases = [
    { sizeMB: 11, description: 'Slightly over limit (11MB)' },
    { sizeMB: 15, description: 'Moderately over limit (15MB)' },
    { sizeMB: 50, description: 'Significantly over limit (50MB - old limit)' }
  ];

  const results = [];

  for (const testCase of testCases) {
    console.log(`${colors.bold}Test Case: ${testCase.description}${colors.reset}`);
    console.log(`${colors.yellow}Generating ${testCase.sizeMB}MB JSON payload...${colors.reset}`);

    const payload = generateOversizedPayload(testCase.sizeMB);
    const actualSizeMB = Buffer.byteLength(payload) / (1024 * 1024);

    console.log(`  Generated payload: ${formatBytes(Buffer.byteLength(payload))} (${actualSizeMB.toFixed(2)} MB)`);
    console.log(`  Sending to ${SERVER_URL}${TEST_ENDPOINT}...`);

    try {
      const response = await sendOversizedRequest(payload, actualSizeMB);
      const verification = verifyRejection(response);

      console.log();
      console.log(`${colors.bold}Response:${colors.reset}`);
      console.log(`  Status: ${response.statusCode} ${response.statusMessage}`);
      console.log(`  Body: ${response.body.substring(0, 200)}${response.body.length > 200 ? '...' : ''}`);
      console.log();
      console.log(`${colors.bold}Verification Results:${colors.reset}`);

      for (const [checkName, check] of Object.entries(verification.checks)) {
        const icon = check.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
        console.log(`  ${icon} ${checkName}:`);
        console.log(`      Expected: ${check.expected}`);
        console.log(`      Actual:   ${check.actual}`);
      }

      console.log();
      if (verification.allPassed) {
        console.log(`${colors.green}${colors.bold}✅ TEST PASSED${colors.reset} - Oversized payload properly rejected`);
      } else {
        console.log(`${colors.red}${colors.bold}❌ TEST FAILED${colors.reset} - Rejection not working as expected`);
      }

      results.push({
        testCase: testCase.description,
        sizeMB: actualSizeMB,
        passed: verification.allPassed,
        statusCode: response.statusCode,
        errorMessage: verification.errorMessage
      });

    } catch (error) {
      console.log(`${colors.red}ERROR: ${error.message}${colors.reset}`);
      results.push({
        testCase: testCase.description,
        sizeMB: testCase.sizeMB,
        passed: false,
        error: error.message
      });
    }

    console.log();
    console.log('─'.repeat(66));
    console.log();
  }

  // Summary
  console.log(`${colors.bold}${colors.blue}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}TEST SUMMARY${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log();

  const allPassed = results.every(r => r.passed);
  const passedCount = results.filter(r => r.passed).length;

  console.log(`Total Test Cases: ${results.length}`);
  console.log(`Passed: ${colors.green}${passedCount}${colors.reset}`);
  console.log(`Failed: ${colors.red}${results.length - passedCount}${colors.reset}`);
  console.log();

  results.forEach((result, i) => {
    const icon = result.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    console.log(`${icon} ${result.testCase} (${result.sizeMB.toFixed(2)} MB)`);
    if (result.statusCode) {
      console.log(`    Status: ${result.statusCode}`);
    }
    if (result.error) {
      console.log(`    ${colors.red}Error: ${result.error}${colors.reset}`);
    }
  });

  console.log();
  console.log(`${colors.bold}${colors.blue}═══════════════════════════════════════════════════════════════${colors.reset}`);

  if (allPassed) {
    console.log(`${colors.green}${colors.bold}🎉 ALL TESTS PASSED - DoS protection working correctly!${colors.reset}`);
    console.log();
    console.log(`${colors.bold}Security Validation:${colors.reset}`);
    console.log(`  ✅ 10MB JSON body limit is enforced`);
    console.log(`  ✅ Oversized payloads are rejected with 413 status`);
    console.log(`  ✅ Clear error messages provided to clients`);
    console.log(`  ✅ DoS attack vector mitigated`);
  } else {
    console.log(`${colors.red}${colors.bold}⚠️  SOME TESTS FAILED - Review results above${colors.reset}`);
  }

  console.log();

  // Exit with appropriate code
  process.exit(allPassed ? 0 : 1);
}

// Run tests
console.log(`${colors.yellow}Starting oversized payload rejection tests...${colors.reset}`);
console.log(`${colors.yellow}Server: ${SERVER_URL}${colors.reset}`);
console.log(`${colors.yellow}Endpoint: ${TEST_ENDPOINT}${colors.reset}`);
console.log();

runTests().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  console.error(error.stack);
  process.exit(1);
});
