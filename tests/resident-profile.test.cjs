const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const css = read('css/style.css');
const crud = read('js/crud.js');
const render = read('js/render.js');
const sw = read('sw.js');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function createProfileHarness(isManager = true) {
    const content = { innerHTML: '' };
    const controls = {
        residentProfileContent: content,
        incomeResident: { value: '' },
        incomeAmount: { value: '' },
        incomeMonth: { value: '' },
        incomePaymentMethod: { value: 'cash' },
        incomeNotes: { value: 'old note' },
        incomeAllocationPreview: { classList: { added: [], add(value) { this.added.push(value); }, remove() {} } },
        incomeAllocationSummary: { textContent: '' },
        incomeAllocationRows: { innerHTML: '' },
        incomeSubmitButton: { disabled: false, textContent: '' }
    };
    const opened = [];
    const closed = [];
    const calls = [];
    const resident = {
        id: 'resident-1',
        name: 'أحمد <مالك>',
        apartmentNumber: '101',
        floor: 'الثاني',
        phone: '01012345678',
        monthlyAmount: 100,
        createdAt: '2025-01-01T00:00:00.000Z',
        notes: '<img src=x onerror=alert(1)>',
        subscriptionRateHistory: [{
            effectiveMonth: '2026-01-01',
            previousMonthlyAmount: 80,
            newMonthlyAmount: 100,
            changedAt: '2026-01-01T00:00:00.000Z'
        }]
    };
    const state = {
        defaultSubscription: 100,
        residents: [resident],
        income: [
            { id: 'payment-1', residentId: 'resident-1', month: 'أكتوبر 2026', amount: 100, paymentMethod: 'cash', date: '2026-10-02T00:00:00.000Z', notes: 'سداد يدوي' },
            { id: 'foreign-payment', residentId: 'another-resident', month: 'أكتوبر 2026', amount: 999, paymentMethod: 'cash', date: '2026-10-03T00:00:00.000Z', notes: '' }
        ]
    };
    const sandbox = {
        state,
        requireManager: () => isManager,
        getCurrentMonth: () => 'نوفمبر 2026',
        getSubscriptionAmountForMonth: () => 100,
        getPaidAmountForMonth: () => 50,
        getMonthOutstanding: (_resident, month) => month === 'نوفمبر 2026' ? 50 : 100,
        calculateCumulativeDebt: () => ({ count: 2, totalDebt: 200, unpaidMonths: ['سبتمبر 2026', 'أكتوبر 2026'] }),
        isSubscriptionMonthOverdue: () => true,
        getIncomePaymentMethodLabel: () => 'نقدًا',
        formatDate: () => 'تاريخ',
        fmtNum: value => String(value ?? 0),
        esc: escapeHtml,
        document: { getElementById: id => controls[id] || null },
        openModal: id => opened.push(id),
        closeModal: id => closed.push(id),
        toast: (...args) => calls.push(args),
        populateSelects() { calls.push(['populateSelects']); }
    };
    const api = vm.runInNewContext(
        crud + String.fromCharCode(10) + '({ buildResidentProfileHtml, openResidentProfile, openResidentIncomeFromProfile, editResidentFromProfile, openSubscriptionRatesFromProfile, sendWhatsAppReminderFromProfile })',
        sandbox,
        { filename: 'js/crud.js' }
    );
    return { api, content, controls, opened, closed, calls, state };
}

test('resident cards expose a separate manager unit profile action', () => {
    assert.match(render, /openResidentProfile\(\$\{esc\(JSON\.stringify\(String\(r\.id\)\)\)\}\)/);
    assert.match(html, /id="residentProfileModal" role="dialog" aria-modal="true"/);
    assert.match(html, /id="residentProfileContent"/);
    assert.match(html, /aria-labelledby="residentProfileModalTitle"/);
    assert.match(css, /#residentProfileContent\s*\{[^}]*overflow-y:auto/);
    assert.match(css, /#residentProfileModal > \.app-card\s*\{[^}]*max-height:calc\(100dvh - 2rem\)/);
    assert.match(crud, /function editResidentFromProfile\(residentId\)[\s\S]*?closeModal\('residentProfileModal'\);[\s\S]*?editResident\(residentId\)/);
    assert.match(crud, /function openSubscriptionRatesFromProfile\(residentId\)[\s\S]*?closeModal\('residentProfileModal'\);[\s\S]*?openSubscriptionRateModal\(residentId\)/);
    assert.match(crud, /function sendWhatsAppReminderFromProfile\(residentId\)[\s\S]*?closeModal\('residentProfileModal'\);[\s\S]*?sendWhatsAppReminder\(residentId\)/);
});

test('profile shows only the selected unit balance, arrears, payments and rate history safely', () => {
    const { api } = createProfileHarness();
    const resident = {
        id: 'resident-1',
        name: 'أحمد <مالك>',
        apartmentNumber: '101',
        floor: 'الثاني',
        phone: '01012345678',
        monthlyAmount: 100,
        createdAt: '2025-01-01T00:00:00.000Z',
        notes: '<img src=x onerror=alert(1)>',
        subscriptionRateHistory: [{
            effectiveMonth: '2026-01-01',
            previousMonthlyAmount: 80,
            newMonthlyAmount: 100,
            changedAt: '2026-01-01T00:00:00.000Z'
        }]
    };
    const profile = api.buildResidentProfileHtml(resident);
    assert.match(profile, /أحمد &lt;مالك&gt;/);
    assert.match(profile, /شقة 101/);
    assert.match(profile, /إجمالي المتأخرات/);
    assert.match(profile, /سبتمبر 2026/);
    assert.match(profile, /أكتوبر 2026/);
    assert.match(profile, /سجل تغييرات الاشتراك/);
    assert.match(profile, /سداد يدوي/);
    assert.doesNotMatch(profile, /999/);
    assert.doesNotMatch(profile, /<img src=x/);
    assert.match(profile, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('opening a unit profile is manager-only and opens the accessible profile dialog', () => {
    const manager = createProfileHarness(true);
    manager.api.openResidentProfile('resident-1');
    assert.equal(manager.opened.at(-1), 'residentProfileModal');
    assert.match(manager.content.innerHTML, /شقة 101/);

    const owner = createProfileHarness(false);
    owner.api.openResidentProfile('resident-1');
    assert.equal(owner.opened.length, 0);
    assert.equal(owner.content.innerHTML, '');
});

test('profile collection action opens the existing income form for its unit without preselecting payment method', () => {
    const { api, controls, opened, closed } = createProfileHarness();
    api.openResidentIncomeFromProfile('resident-1');
    assert.equal(controls.incomeResident.value, 'resident-1');
    assert.equal(controls.incomeAmount.value, '');
    assert.equal(controls.incomeMonth.value, 'نوفمبر 2026');
    assert.equal(controls.incomePaymentMethod.value, '');
    assert.equal(controls.incomeNotes.value, '');
    assert.equal(closed.at(-1), 'residentProfileModal');
    assert.equal(opened.at(-1), 'incomeModal');
    assert.ok(controls.incomeAllocationPreview.classList.added.includes('hidden'));
});

test('profile feature refreshes the installed application cache', () => {
    assert.match(sw, /CACHE_NAME = 'manzil-v115'/);
});
