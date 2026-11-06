const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const partial = fs.readFileSync(path.join(root, 'src', 'partials', 'main-tabs.html'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const render = fs.readFileSync(path.join(root, 'js', 'render.js'), 'utf8');

test('income list exposes month, purpose, cashbox and payment method filters', () => {
    for (const id of ['filterIncomeMonth', 'filterIncomePurpose', 'filterIncomeCashbox', 'filterIncomePaymentMethod', 'searchIncomeInput']) {
        assert.match(partial, new RegExp('id="' + id + '"'));
        assert.match(html, new RegExp('id="' + id + '"'));
    }
    assert.match(partial, /grid-cols-2 md:grid-cols-4/);
});

test('income list totals only the filtered movements and shows a live summary', () => {
    assert.match(render, /items\.reduce\(\(sum, item\) => sum \+ \(Number\(item\.amount\) \|\| 0\), 0\)/);
    assert.match(render, /id="incomeResultsSummary"/);
    assert.match(render, /إجمالي النتائج/);
    assert.match(render, /عدد الحركات/);
});

test('income filters preserve unknown legacy payment methods without guessing', () => {
    assert.match(render, /item\.paymentMethod \|\| '__unspecified__'/);
    assert.match(render, /paymentMethod === '__unspecified__'[\s\S]*?!item\.paymentMethod/);
});

test('distributed payment batches are grouped without losing per-line receipt and edit actions', () => {
    assert.match(render, /function getIncomeListBatchKey\(item\)/);
    assert.match(render, /دفعة مجمعة/);
    assert.match(render, /renderIncomeListRow\(item, resident\)/);
    assert.match(render, /openIncomeReceiptModal\('\$\{item\.id\}'\)/);
    assert.match(render, /sendIncomeReceiptOnWhatsApp\('\$\{item\.id\}'\)/);
    assert.match(render, /openIncomeEditModal\('\$\{item\.id\}'\)/);
});
