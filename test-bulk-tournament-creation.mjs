#!/usr/bin/env node
/**
 * Test script for bulk tournament event creation
 * Validates that creating 50 tournament events works under the new 10MB JSON body limit
 */

const API_URL = 'http://localhost:3002';

// Generate test data for 50 tournament events
function generateTestEvents(count = 50) {
  const events = [];
  const games = ['NLH', 'PLO', 'PLO5', 'Mixed'];
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  for (let i = 0; i < count; i++) {
    const day = daysOfWeek[i % 7];
    events.push({
      day: day,
      name: `Tournament ${i + 1} - ${games[i % games.length]}`,
      game: games[i % games.length],
      gtd: (i + 1) * 1000,
      buyIn: 100 + (i * 10),
      rebuy: 100,
      addOn: 100,
      stack: 10000 + (i * 1000),
      players: 50 + i,
      lateReg: 60 + (i * 5),
      minutes: 15,
      structure: 'Standard',
      times: {
        start: `${12 + (i % 12)}:00`,
        end: `${14 + (i % 12)}:00`
      },
      eventDate: new Date(Date.now() + i * 86400000).toISOString()
    });
  }

  return events;
}

// Create test payload
function createTestPayload(eventCount = 50) {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    user_id: 'test_user_bulk_tournament_creation',
    organization_id: null,
    start_date: now.toISOString(),
    end_date: nextWeek.toISOString(),
    filename: `bulk_test_${eventCount}_events.csv`,
    events: generateTestEvents(eventCount)
  };
}

async function testBulkTournamentCreation() {
  console.log('🧪 Testing bulk tournament event creation...\n');

  const payload = createTestPayload(50);
  const payloadSize = JSON.stringify(payload).length;
  const payloadSizeKB = (payloadSize / 1024).toFixed(2);
  const payloadSizeMB = (payloadSize / (1024 * 1024)).toFixed(2);

  console.log(`📊 Test Parameters:`);
  console.log(`   - Event count: ${payload.events.length}`);
  console.log(`   - Payload size: ${payloadSizeKB} KB (${payloadSizeMB} MB)`);
  console.log(`   - Size limit: 10 MB\n`);

  if (payloadSize > 10 * 1024 * 1024) {
    console.error('❌ ERROR: Payload exceeds 10MB limit!');
    console.error(`   Payload: ${payloadSizeMB} MB > 10 MB`);
    process.exit(1);
  }

  console.log('✅ Payload size check: PASSED (under 10MB limit)\n');

  try {
    console.log(`📤 Sending POST request to ${API_URL}/api/db/tournaments...`);

    const response = await fetch(`${API_URL}/api/db/tournaments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Failed to parse response as JSON');
      console.error('Response:', responseText.substring(0, 500));
      process.exit(1);
    }

    console.log(`📥 Response status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      console.error('❌ TEST FAILED: Request returned error status');
      console.error('Response:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    // Validate response
    if (data.schedule && data.schedule.id) {
      console.log('✅ TEST PASSED: Tournament schedule created successfully');
      console.log(`   - Schedule ID: ${data.schedule.id}`);
      console.log(`   - Start date: ${data.schedule.start_date}`);
      console.log(`   - End date: ${data.schedule.end_date}`);
      console.log(`   - Filename: ${data.schedule.filename}`);
      console.log('\n📊 Summary:');
      console.log(`   ✅ Sent 50 tournament events in a single request`);
      console.log(`   ✅ Payload size: ${payloadSizeKB} KB (well under 10MB limit)`);
      console.log(`   ✅ Server accepted and processed the bulk operation`);
      console.log(`   ✅ Largest known batch operation works under new limit`);
      console.log('\n✨ Verification complete! The 10MB limit is sufficient for bulk operations.\n');
      process.exit(0);
    } else {
      console.error('❌ TEST FAILED: Unexpected response format');
      console.error('Response:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ TEST FAILED: Network or server error');
    console.error('Error:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    process.exit(1);
  }
}

// Run the test
testBulkTournamentCreation();
