const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const crud = read('js/crud.js');
const supabase = read('js/supabase.js');
const render = read('js/render.js');
const notices = read('js/notices.js');
const backup = read('js/backup.js');
const migration = read('supabase/migrations/20261104010000_income_payment_method.sql');

test('new collections and edited collections require one of the supported payment methods', () => {
    for (const [id, value] of [
        ['incomePaymentMethod', 'cash'],
        ['incomePaymentMethod', 'wallet'],
        ['incomePaymentMethod', 'instapay'],
        ['incomePaymentMethod', 'bank_transfer'],
        ['incomeEditPaymentMethod', 'cash'],
        ['incomeEditPaymentMethod', 'wallet'],
        ['incomeEditPaymentMethod', 'instapay'],
        ['incomeEditPaymentMethod', 'bank_transfer']
    ]) {
        assert.match(html, new RegExp('id="' + id + '"'));
        assert.ok(html.includes('value="' + value + '"'));
    }
    assert.match(crud, /const paymentMethod = document\.getElementById\('incomePaymentMethod'\)\.value/);
    assert.match(crud, /paymentMethod,/);
    assert.match(crud, /payment\.paymentMethod = paymentMethod/);
});

test('payment method is loaded, persisted, displayed and included in WhatsApp receipts', () => {
    assert.match(supabase, /payment_method: i\.paymentMethod \|\| null/);
    assert.match(supabase, /paymentMethod: row\.payment_method \|\| null/);
    assert.match(supabase, /payment_method,paid_at/);
    assert.match(render, /getIncomePaymentMethodLabel\(i\.paymentMethod\)/);
    assert.match(notices, /طريقة الدفع: \$\{getIncomePaymentMethodLabel\(payment\.paymentMethod\)\}/);
});

test('database migration keeps legacy payment methods unknown and validates new values', () => {
    assert.match(migration, /ADD COLUMN payment_method text/);
    assert.match(migration, /payment_method IS NULL OR payment_method IN \('cash', 'wallet', 'instapay', 'bank_transfer'\)/);
    assert.match(migration, /payment_method = EXCLUDED\.payment_method/);
    assert.match(migration, /invalid_income_payment_method/);
});

test('old backups without a payment method remain restorable', () => {
    assert.match(backup, /i\.paymentMethod === undefined \|\| i\.paymentMethod === null/);
});
