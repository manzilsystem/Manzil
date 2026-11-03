const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20261103112500_monthly_cashbox_close.sql');
const moduleSource = read('js/monthly-close.js');
const html = read('index.html');
const render = read('js/render.js');
const integration = read('tests/monthly-cashbox-close.integration.sql');

test('monthly close is manager-only and read-only in Cairo local time', () => {
    assert.match(migration, /private\.get_monthly_cashbox_close/);
    assert.match(migration, /member\.role = 'manager'/);
    assert.match(migration, /Africa\/Cairo/);
    assert.match(migration, /payment\.paid_at/);
    assert.match(migration, /expense\.spent_at/);
    assert.match(migration, /transfer\.transferred_at/);
    assert.match(migration, /'reconciled', v_reconciled/);
    assert.doesNotMatch(migration, /\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
});

test('monthly close uses the database as its source of truth', () => {
    assert.match(moduleSource, /rpc\('get_monthly_cashbox_close'/);
    assert.match(moduleSource, /p_month:\s*monthKey/);
    assert.doesNotMatch(moduleSource, /state\.cashTransfers\.reduce/);
    assert.doesNotMatch(moduleSource, /state\.income\.reduce/);
    assert.doesNotMatch(moduleSource, /state\.expenses\.reduce/);
});

test('monthly close UI and export remain manager-side and Arabic RTL', () => {
    assert.match(html, /id="monthlyCloseMonthSelect"/);
    assert.match(html, /id="monthlyClosePreview"/);
    assert.match(html, /onclick="loadMonthlyCloseReport\(\)"/);
    assert.match(html, /onclick="exportMonthlyClosePdf\(\)"/);
    assert.match(html, /dir="rtl"/);
    assert.match(html, /js\/monthly-close\.js/);
    assert.match(moduleSource, /html2pdf\.js/);
    assert.match(moduleSource, /application\/pdf/);
    assert.match(render, /'monthlyCloseMonthSelect'/);
});

test('integration test covers timezone boundaries, all three funds, and role restrictions', () => {
    assert.match(integration, /2026-10-31T22:30:00Z/);
    assert.match(integration, /2026-11-30T22:00:00Z/);
    assert.match(integration, /opening_balance.*<> 100/s);
    assert.match(integration, /development fund close mismatch/);
    assert.match(integration, /emergency fund close mismatch/);
    assert.match(integration, /non-manager user accessed monthly cashbox close/);
});
