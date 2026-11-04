const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function createApp() {
    const now = new Date();
    const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const resident = {
        id: 'resident-1', name: 'ساكن', apartmentNumber: '1', floor: '1',
        phone: '', notes: '', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z',
        subscriptionRates: [{ effectiveMonth: month + '-01', monthlyAmount: 100 }]
    };
    const values = {
        residentName: 'ساكن', residentApartment: '1', residentFloor: '1',
        residentPhone: '', residentAmount: '175', residentNotes: ''
    };
    const elements = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, {
        value, readOnly: false, textContent: '', innerHTML: '',
        classList: { add() {}, remove() {} },
        removeAttribute() {}, setAttribute() {}
    }]));
    elements.residentAmountHelp = { textContent: '', classList: { add() {}, remove() {} } };
    elements.residentModalTitle = { textContent: '' };
    elements.manageSubscriptionRatesBtn = { classList: { add() {}, remove() {} } };
    const sandbox = {
        state: { residents: [resident], floorCount: 1, apartmentsPerFloor: 1, defaultSubscription: 100 },
        editingResidentId: 'resident-1',
        requireManager: () => true,
        document: { getElementById: id => elements[id] || null },
        openModal() {}, closeModal() {}, renderAll() {},
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(sandbox.state)),
        saveWithRollback: async () => true,
        logAction() {}, toast() {}, generateId: () => 'new-resident',
        INCOME_PAYMENT_METHOD_LABELS: {},
        esc: value => String(value ?? '')
    };
    const app = vm.runInNewContext(crudSource + '\n({ openResidentModal, handleResidentSubmit })', sandbox);
    return { app, sandbox, elements, month };
}

test('active subscription amount stays editable in the apartment form', () => {
    const { app, elements } = createApp();
    app.openResidentModal('edit', 'resident-1');
    assert.equal(elements.residentAmount.readOnly, false);
    assert.match(elements.residentAmountHelp.textContent, /تعديل الاشتراك مباشرة/);
    assert.ok(html.includes('id="manageSubscriptionRatesBtn"'));
    assert.ok(html.includes('تحديد / تعديل الاشتراك وسجله التاريخي'));
});

test('changing the apartment amount records a new current-month rate and preserves historical rates', async () => {
    const { app, sandbox, elements, month } = createApp();
    const oldHistory = { effectiveMonth: '2024-01-01', monthlyAmount: 80 };
    sandbox.state.residents[0].subscriptionRates.unshift(oldHistory);
    elements.residentAmount.value = '175';
    await app.handleResidentSubmit({ preventDefault() {} });
    const resident = sandbox.state.residents[0];
    assert.equal(resident.monthlyAmount, 175);
    assert.equal(resident.subscriptionRates.find(rate => rate.effectiveMonth === month + '-01').monthlyAmount, 175);
    assert.ok(resident.subscriptionRates.some(rate => rate.effectiveMonth === '2024-01-01' && rate.monthlyAmount === 80));
});
