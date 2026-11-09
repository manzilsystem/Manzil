const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const partial = fs.readFileSync(path.join(root, 'src', 'partials', 'main-tabs.html'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const render = fs.readFileSync(path.join(root, 'js', 'render.js'), 'utf8');
const crud = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');

test('income list exposes month, purpose, cashbox and payment method filters', () => {
    for (const id of ['filterIncomeMonth', 'filterIncomePurpose', 'filterIncomeCashbox', 'filterIncomePaymentMethod', 'searchIncomeInput']) {
        assert.match(partial, new RegExp('id="' + id + '"'));
        assert.match(html, new RegExp('id="' + id + '"'));
    }
    assert.match(partial, /grid-cols-2 md:grid-cols-4/);
});

test('income list totals only the filtered movements and shows a live summary', () => {
    assert.match(render, /items\.reduce\(\(sum, item\) => sum \+ \(Number\(item\.amount\) \|\| 0\), 0\)/);
    assert.match(render, /getElementById\('incomeResultsSummary'\)/);
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
    assert.match(render, /renderIncomeListRow\(item, resident/);
    assert.match(render, /openIncomeReceiptModal\('\$\{i\.id\}'\)/);
    assert.match(render, /sendIncomeReceiptOnWhatsApp\('\$\{i\.id\}'\)/);
    assert.match(render, /openIncomeEditModal\('\$\{i\.id\}'\)/);
});

test('income list numbers every entry and numbers the lines inside a distributed batch', () => {
    assert.match(crud, /function getIncomeBatchPosition\(payment\)/);
    assert.match(render, /const entryNumber = groupIndex \+ 1/);
    assert.match(render, /renderIncomeListRow\(first, resident, String\(entryNumber\)\)/);
    assert.match(render, /getIncomeBatchPosition\(item\)/);
    assert.match(render, /rowIndexLabel/);
});

test('getIncomeBatchPosition parses the line index of a distributed payment and ignores other notes', () => {
    const api = vm.runInNewContext(`${crud}\n({ getIncomeBatchPosition })`, {}, { filename: 'js/crud.js' });
    const position = item => JSON.stringify(api.getIncomeBatchPosition(item));
    assert.equal(position({ notes: 'دفعة موزعة AB12CD (2/3)' }), '{"index":2,"total":3}');
    assert.equal(position({ notes: 'دفعة موزعة AB12CD (2/3) · نظافة المبنى' }), '{"index":2,"total":3}');
    assert.equal(position({ notes: 'اشتراك شهري' }), 'null');
    assert.equal(position({ notes: '' }), 'null');
    assert.equal(position(null), 'null');
});

test('distributed batch header exposes whole-batch receipt actions', () => {
    assert.match(render, /openIncomeReceiptModal\('\$\{first\.id\}'\)/);
    assert.match(render, /sendIncomeReceiptOnWhatsApp\('\$\{first\.id\}'\)/);
    assert.match(render, /عرض إيصال الدفعة كاملًا/);
});

test('income entry numbering renders inside the row so it stays RTL-aligned with the apartment badge', () => {
    assert.match(render, /min-w-\[1\.75rem\] text-center shrink-0/);
});
