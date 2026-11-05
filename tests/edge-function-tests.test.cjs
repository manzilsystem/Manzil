const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const functionsDir = path.join(__dirname, '..', 'supabase', 'functions');
const workflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'node-tests.yml'),
  'utf8'
);

const functionNames = fs
  .readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

test('every Edge Function exports a testable request handler', () => {
  assert.ok(functionNames.length > 0, 'expected at least one Edge Function');

  for (const name of functionNames) {
    const source = fs.readFileSync(path.join(functionsDir, name, 'index.ts'), 'utf8');
    assert.match(source, /export async function handleRequest\(/, `${name} must export handleRequest`);
    assert.match(source, /if \(import\.meta\.main\)\s*{\s*Deno\.serve\(handleRequest\)/, `${name} must only listen when it is the entry module`);
  }
});

test('every Edge Function has an HTTP test module', () => {
  for (const name of functionNames) {
    const testFile = path.join(functionsDir, name, 'index_test.ts');
    assert.ok(fs.existsSync(testFile), `${name} is missing index_test.ts`);
    const source = fs.readFileSync(testFile, 'utf8');
    assert.match(source, /Deno\.test\(/, `${name} test module must contain Deno tests`);
  }
});

test('CI runs the Edge Function test modules', () => {
  assert.match(workflow, /deno test --allow-env --allow-net supabase\/functions\/\*\/index_test\.ts/);
});
