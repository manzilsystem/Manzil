const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function currentMonth() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function createApp() {
    const month = currentMonth();
    const residents = [
        {
            id: 'r10', name: 'سامي', apartmentNumber: '10', monthlyAmount: 100,
            createdAt: '2024-01-01T00:00:00.000Z',
            subscriptionRates: [
                { effectiveMonth: '2024-01-01', monthlyAmount: 80 },
                { effectiveMonth: month + '-01', monthlyAmount: 100 }
            ]
        },
        {
            id: 'r2', name: 'منى', apartmentNumber: '2', monthlyAmount: 100,
            createdAt: '2024-01-01T00:00:00.000Z',
            subscriptionRates: [{ effectiveMonth: month + '-01', monthlyAmount: 100 }]
        }
    ];
    const inputs = residents.map(resident => ({
        value: '100',
        dataset: { priceSheetResident: resident.id },
        classList: { toggle() {} }
    }));
    const elements = {
        subscriptionPriceSheetMonth: { value: month, min: '' },
        subscriptionPriceSheetUniform: { value: '' },
        subscriptionPriceSheetBody: { innerHTML: '' },
        subscriptionPriceSheetSummary: { textContent: '', classList: { toggle() {} } },
        subscriptionPriceSheetSave: { disabled: false }
    };
    const calls = { saves: 0, logs: [], toasts: [], closed: [] };
    const sandbox = {
        state: { residents, defaultSubscription: 100 },
        monthsNames: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
        requireManager: () => true,
        document: {
            getElementById: id => elements[id] || null,
            querySelectorAll: selector => selector === '[data-price-sheet-resident]' ? inputs : []
        },
        openModal() {},
        closeModal: id => calls.closed.push(id),
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(sandbox.state)),
        saveWithRollback: async () => { calls.saves += 1; return true; },
        logAction: (action, details) => calls.logs.push({ action, details }),
        toast: (message, type) => calls.toasts.push({ message, type })
    };
    const app = vm.runInNewContext(
        crudSource + '\n({ openSubscriptionPriceSheet, renderSubscriptionPriceSheet, applySubscriptionPriceSheetUniform, updateSubscriptionPriceSheetSummary, saveSubscriptionPriceSheet, collectSubscriptionPriceSheetChanges })',
        sandbox
    );
    return { app, sandbox, elements, inputs, calls, month };
}

test('residents tab exposes the monthly price sheet and its modal fields', () => {
    assert.match(html, /onclick="openSubscriptionPriceSheet\(\)"/);
    assert.match(html, /id="subscriptionPriceSheetModal"/);
    assert.match(html, /type="month" id="subscriptionPriceSheetMonth"/);
    assert.match(html, /id="subscriptionPriceSheetBody"/);
    assert.match(html, /id="subscriptionPriceSheetUniform"/);
});

test('price sheet lists apartments by number with their effective rate', () => {
    const { app, elements } = createApp();
    app.openSubscriptionPriceSheet();
    assert.equal(elements.subscriptionPriceSheetMonth.value, currentMonth());
    assert.equal(elements.subscriptionPriceSheetMonth.min, currentMonth());
    assert.ok(elements.subscriptionPriceSheetBody.innerHTML.indexOf('منى') < elements.subscriptionPriceSheetBody.innerHTML.indexOf('سامي'));
    assert.match(elements.subscriptionPriceSheetBody.innerHTML, /شقة 2/);
    assert.match(elements.subscriptionPriceSheetBody.innerHTML, /شقة 10/);
    assert.match(elements.subscriptionPriceSheetBody.innerHTML, /value="100"/);
    assert.match(elements.subscriptionPriceSheetSummary.textContent, /لا توجد تغييرات/);
});

test('uniform fill enables saving and writes one rate row per changed apartment', async () => {
    const { app, sandbox, elements, inputs, calls, month } = createApp();
    app.openSubscriptionPriceSheet();
    elements.subscriptionPriceSheetUniform.value = '150';
    app.applySubscriptionPriceSheetUniform();
    assert.deepEqual(inputs.map(input => input.value), ['150', '150']);
    assert.match(elements.subscriptionPriceSheetSummary.textContent, /سيتم تحديث 2 شقة/);
    assert.equal(elements.subscriptionPriceSheetSave.disabled, false);

    await app.saveSubscriptionPriceSheet({ preventDefault() {} });

    assert.equal(calls.saves, 1);
    assert.equal(calls.logs.length, 1);
    assert.match(calls.logs[0].action, /ورقة أسعار الاشتراك/);
    assert.deepEqual(calls.closed, ['subscriptionPriceSheetModal']);
    const r10 = sandbox.state.residents.find(resident => resident.id === 'r10');
    const r2 = sandbox.state.residents.find(resident => resident.id === 'r2');
    assert.equal(r10.subscriptionRates.find(rate => rate.effectiveMonth === month + '-01').monthlyAmount, 150);
    assert.equal(r2.subscriptionRates.find(rate => rate.effectiveMonth === month + '-01').monthlyAmount, 150);
    assert.ok(r10.subscriptionRates.some(rate => rate.effectiveMonth === '2024-01-01' && rate.monthlyAmount === 80));
    assert.equal(r10.subscriptionRates.filter(rate => rate.effectiveMonth === month + '-01').length, 1);
});

test('past months and invalid amounts are rejected before saving', async () => {
    const { app, elements, inputs, calls } = createApp();
    app.openSubscriptionPriceSheet();
    elements.subscriptionPriceSheetMonth.value = '2020-01';
    app.renderSubscriptionPriceSheet();
    inputs[0].value = '150';
    await app.saveSubscriptionPriceSheet({ preventDefault() {} });
    assert.equal(calls.saves, 0);
    assert.match(calls.toasts.at(-1).message, /لا يمكن تعديل أسعار شهر سابق/);

    elements.subscriptionPriceSheetMonth.value = currentMonth();
    app.renderSubscriptionPriceSheet();
    inputs[0].value = '-5';
    app.updateSubscriptionPriceSheetSummary();
    assert.equal(elements.subscriptionPriceSheetSave.disabled, true);
    await app.saveSubscriptionPriceSheet({ preventDefault() {} });
    assert.equal(calls.saves, 0);
    assert.match(calls.toasts.at(-1).message, /أصلح قيم الاشتراك/);
});
