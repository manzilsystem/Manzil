const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'supabase/functions/monitor-client-errors/index.ts'),
  'utf8'
);

test('monitor-client-errors validates cron secret', () => {
  assert.match(source, /expectedSecret = Deno\.env\.get\("CRON_SECRET"\)/);
  assert.match(source, /secret !== expectedSecret/);
});

test('monitor-client-errors checks client_errors table in last 24h', () => {
  assert.match(source, /from\("client_errors"\)/);
  assert.match(source, /gte\("created_at"/);
  assert.match(source, /24 \* 60 \* 60 \* 1000/);
});

test('monitor-client-errors logs error when count exceeds threshold', () => {
  assert.match(source, /threshold = 100/);
  assert.match(source, /errorCount > threshold/);
  assert.match(source, /console\.error.*High error rate/);
});
