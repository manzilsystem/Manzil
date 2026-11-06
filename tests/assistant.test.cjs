const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const stateSource = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
const assistantSource = fs.readFileSync(path.join(root, 'js', 'assistant.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const NOW = new Date(2026, 10, 15, 12, 0, 0);

const RESIDENTS = [
    { id: 'r1', name: 'أحمد علي', apartmentNumber: '3', monthlyAmount: 100, billingStartMonth: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'r2', name: 'سارة حسن', apartmentNumber: '7', monthlyAmount: 200, billingStartMonth: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' }
];

const INCOME = [
    { id: 'i1', residentId: 'r1', month: 'نوفمبر 2026', amount: 100, purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'cash', date: '2026-11-03T10:00:00.000Z' },
    { id: 'i2', residentId: 'r2', month: 'نوفمبر 2026', amount: 50, purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'cash', date: '2026-11-04T10:00:00.000Z' },
    { id: 'i3', residentId: 'r1', month: 'نوفمبر 2026', amount: 40, purposeCode: 'development', cashAccountCode: 'development', paymentMethod: 'instapay', date: '2026-11-05T10:00:00.000Z' },
    { id: 'i4', residentId: 'r2', month: 'أكتوبر 2026', amount: 200, purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'cash', date: '2026-10-04T10:00:00.000Z' }
];

const EXPENSES = [
    { id: 'e1', month: 'نوفمبر 2026', title: 'نظافة', amount: 60, category: 'نظافة', cashAccountCode: 'main', date: '2026-11-04T10:00:00.000Z' },
    { id: 'e2', month: 'نوفمبر 2026', title: 'كهرباء', amount: 40, category: 'كهرباء', cashAccountCode: 'main', date: '2026-11-05T10:00:00.000Z' },
    { id: 'e3', month: 'أكتوبر 2026', title: 'صيانة أسانسير', amount: 25, category: 'صيانة أسانسير', cashAccountCode: 'main', date: '2026-10-05T10:00:00.000Z' }
];

const ADJUSTMENTS = [
    { id: 'a1', residentId: 'r2', kind: 'waiver', effectiveMonth: '2026-11-01', amount: 30, reason: 'ظرف طارئ' },
    { id: 'a2', residentId: 'r1', kind: 'discount', effectiveMonth: '2026-10-01', amount: 10, reason: 'خصم أخوة' }
];

function createHarness(seed = true) {
    const sandbox = {
        console,
        Date,
        setTimeout,
        clearTimeout,
        document: {
            getElementById: () => null,
            querySelector: () => null,
            addEventListener() {},
            body: { classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {} }
        },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        crypto: { randomUUID: () => 'test-id' },
        requestAnimationFrame: callback => callback(),
        currentUserRole: 'manager',
        activeBuildingId: 'building-1'
    };
    const context = vm.createContext(sandbox);
    vm.runInContext(stateSource, context, { filename: 'js/state.js' });
    vm.runInContext(assistantSource, context, { filename: 'js/assistant.js' });
    if (seed) {
        vm.runInContext(`
            state.buildingName = 'عمارة النور';
            state.managerName = 'أ. محمد';
            state.defaultSubscription = 100;
            state.floorCount = 5;
            state.apartmentsPerFloor = 4;
            state.startingBalance = 500;
            state.cashAccountBalances = { main: 1200, development: 300, emergency: 50 };
            state.residents = ${JSON.stringify(RESIDENTS)};
            state.income = ${JSON.stringify(INCOME)};
            state.expenses = ${JSON.stringify(EXPENSES)};
            state.adjustments = ${JSON.stringify(ADJUSTMENTS)};
        `, context);
    }
    const api = vm.runInContext(`({
        answerAssistantQuery,
        buildAssistantGreetingHtml,
        detectAssistantIntent,
        getAssistantArrearsSnapshot,
        getAssistantCashSnapshot,
        getAssistantExpenseSnapshot,
        getAssistantIncomeSnapshot,
        getAssistantMonthSummary,
        getAssistantNowLabel,
        getAssistantResidentSnapshot,
        normalizeAssistantArabic,
        resolveAssistantPeriod,
        resolveAssistantResident,
        assistantEscape,
        ASSISTANT_NAME,
        ASSISTANT_SUGGESTIONS
    })`, context);
    return { context, api };
}

test('assistant modal, launcher, script and styles are wired into the app', () => {
    assert.match(html, /id="assistantModal"/);
    assert.match(html, /id="assistantLog"[^>]*role="log"[^>]*aria-live="polite"/);
    assert.match(html, /id="assistantInput"[^>]*maxlength="240"/);
    assert.match(html, /id="assistantSuggestions"[^>]*onclick="handleAssistantSuggestion\(event\)"/);
    assert.match(html, /onsubmit="sendAssistantMessage\(event\)"/);
    assert.match(html, /<button type="button" id="assistantFab"[^>]*onclick="openAssistantModal\(\)"/);
    assert.match(html, /aria-label="اسأل عم عبده البواب"/);
    assert.match(html, /class="assistant-fab-avatar"[^>]*src="icons\/assistant-abbah\.png"/);
    assert.doesNotMatch(html, /assistant-header-button/, 'the launcher left the header for the floating button');
    assert.ok(html.indexOf('js/assistant.js') > -1, 'assistant script is included');
    assert.ok(html.indexOf('js/assistant.js') < html.indexOf('js/app.js'), 'assistant loads before app bootstrap');
    assert.match(css, /\.assistant-fab \{/);
    assert.match(css, /\.assistant-fab\.is-hidden \{/);
    assert.match(css, /body\.owner-mode \.assistant-fab/);
    assert.match(css, /@media print \{ \.assistant-fab \{ display: none !important; \} \}/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.assistant-fab/);
    assert.match(css, /\.assistant-avatar img \{/);
    assert.match(css, /\.assistant-hero \{/);
    assert.match(assistantSource, /icons\/assistant-abbah-full\.png/, 'the greeting shows the full-body avatar');
    assert.match(serviceWorker, /\.\/icons\/assistant-abbah\.png/);
    assert.match(serviceWorker, /\.\/icons\/assistant-abbah-full\.png/);
    assert.match(assistantSource, /ASSISTANT_FAB_SCROLL_DEADZONE/, 'scroll direction drives the launcher');
    assert.match(assistantSource, /window\.addEventListener\('scroll', handleAssistantFabScroll, \{ passive: true \}\)/);
    assert.match(assistantSource, /new MutationObserver\(\(\) => syncAssistantFab\(\)\)\.observe\(modal/);
    assert.doesNotMatch(assistantSource, /addEventListener\('focus'/, 'a visibility-hidden launcher is not focusable, so no focus handler is needed');
    assert.match(css, /\.assistant-msg\.is-user \.assistant-bubble/);
    assert.match(css, /@media print \{\s*#assistantModal \{ display: none !important; \}/);
});

test('avatar art is transparent PNG so it matches every theme', () => {
    const avatars = ['icons/assistant-abbah.png', 'icons/assistant-abbah-full.png'];
    for (const relative of avatars) {
        const bytes = fs.readFileSync(path.join(root, relative));
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative} is a PNG`);
        const colorType = bytes.readUInt8(25);
        assert.equal(colorType & 4, 4, `${relative} carries a real alpha channel`);
        assert.ok(bytes.readUInt32BE(16) === bytes.readUInt32BE(20), `${relative} stays square`);
        assert.ok(bytes.includes(Buffer.from('IEND', 'ascii')), `${relative} is not truncated`);
    }
});

test('assistant is local-only and never touches the network', () => {
    assert.doesNotMatch(assistantSource, /\bfetch\s*\(/);
    assert.doesNotMatch(assistantSource, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(assistantSource, /https?:\/\//);
    assert.doesNotMatch(assistantSource, /supabase/i);
    assert.match(assistantSource, /مساعد محلي/);
});

test('arabic normalization and period resolution understand months, years and rollover phrasing', () => {
    const { api } = createHarness();
    assert.equal(api.normalizeAssistantArabic('  أَحْمَد  '), 'احمد');
    assert.equal(api.normalizeAssistantArabic('شقة'), 'شقه');
    assert.equal(api.normalizeAssistantArabic('إعفاء'), 'اعفاء');
    assert.equal(api.normalizeAssistantArabic('٣'), '3');

    assert.equal(api.resolveAssistantPeriod('تحصيل نوفمبر', NOW).label, 'نوفمبر 2026');
    assert.equal(api.resolveAssistantPeriod('تحصيل يناير 2025', NOW).label, 'يناير 2025');
    assert.equal(api.resolveAssistantPeriod('تحصيل الشهر الماضي', NOW).label, 'أكتوبر 2026');
    const year = api.resolveAssistantPeriod('مصروفات سنة 2025', NOW);
    assert.equal(year.type, 'year');
    assert.equal(year.months.length, 12);
    assert.equal(year.months[0], 'يناير 2025');
    assert.equal(api.resolveAssistantPeriod('كل الفتره', NOW).type, 'all');
});

test('income answers separate subscriptions from other purposes', () => {
    const { api } = createHarness();
    const income = api.getAssistantIncomeSnapshot(['نوفمبر 2026']);
    assert.equal(income.total, 190);
    assert.equal(income.subscriptionTotal, 150);
    assert.equal(income.otherTotal, 40);
    assert.equal(income.count, 3);

    const answer = api.answerAssistantQuery('تحصيل نوفمبر 2026', NOW);
    assert.equal(answer.id, 'income');
    assert.equal(answer.title, 'تحصيل نوفمبر 2026');
    assert.match(answer.html, /190 ج\.م/);
    assert.match(answer.html, /150 ج\.م/);
    assert.match(answer.html, /40 ج\.م/);
});

test('expense answers use all funds and group by category', () => {
    const { api } = createHarness();
    const expenses = api.getAssistantExpenseSnapshot(['نوفمبر 2026']);
    assert.equal(expenses.total, 100);
    assert.equal(expenses.count, 2);
    assert.deepEqual(Array.from(expenses.categories, item => item.label), ['نظافة', 'كهرباء']);

    const answer = api.answerAssistantQuery('مصروفات نوفمبر 2026', NOW);
    assert.equal(answer.id, 'expenses');
    assert.match(answer.html, /100 ج\.م/);
    assert.match(answer.html, /نظافة/);
    assert.match(answer.html, /كهرباء/);
    assert.doesNotMatch(answer.html, /صيانة أسانسير/);
});

test('summary combines collections, expenses, current dues and unpaid units', () => {
    const { api } = createHarness();
    const summary = api.getAssistantMonthSummary({ type: 'month', label: 'نوفمبر 2026', months: ['نوفمبر 2026'] }, NOW);
    assert.equal(summary.income.total, 190);
    assert.equal(summary.expenses.total, 100);
    assert.equal(summary.net, 90);
    assert.equal(summary.dueTotal, 300);
    assert.equal(summary.paidSubscriptionTotal, 150);
    assert.equal(summary.adjustmentsTotal, 30);
    assert.equal(summary.outstandingTotal, 120);
    assert.equal(summary.paidUnits, 1);
    assert.equal(summary.partialUnits, 1);
    assert.equal(summary.unpaidUnits, 1);

    const answer = api.answerAssistantQuery('ملخص الشهر', NOW);
    assert.equal(answer.id, 'summary');
    assert.match(answer.html, /190 ج\.م/);
    assert.match(answer.html, /120 ج\.م/);
    assert.match(answer.html, /1 من 2/);
    assert.match(answer.html, /سارة حسن/);
});

test('resident answers resolve by name or apartment and show adjustments', () => {
    const { api } = createHarness();
    const byName = api.answerAssistantQuery('أحمد دفع كام؟', NOW);
    assert.equal(byName.id, 'resident');
    assert.match(byName.title, /شقة 3/);
    assert.match(byName.title, /أحمد علي/);
    assert.match(byName.html, /100 ج\.م/);
    assert.match(byName.html, /0 ج\.م/);

    const byApartment = api.answerAssistantQuery('شقة 7 دفع كام؟', NOW);
    assert.equal(byApartment.id, 'resident');
    assert.match(byApartment.title, /شقة 7/);
    assert.match(byApartment.title, /سارة حسن/);
    assert.match(byApartment.html, /200 ج\.م/);
    assert.match(byApartment.html, /30 ج\.م/);
    assert.match(byApartment.html, /120 ج\.م/);

    const snapshot = api.getAssistantResidentSnapshot(RESIDENTS[1], NOW);
    assert.equal(snapshot.subscription, 200);
    assert.equal(snapshot.paid, 50);
    assert.equal(snapshot.adjusted, 30);
    assert.equal(snapshot.outstanding, 120);
    assert.equal(snapshot.monthPayments.length, 1);
    assert.equal(snapshot.lastPayment.id, 'i2');
});

test('ambiguous resident names ask for the apartment instead of guessing', () => {
    const { context, api } = createHarness();
    vm.runInContext(`state.residents.push({ id: 'r3', name: 'أحمد سيد', apartmentNumber: '9', monthlyAmount: 100, billingStartMonth: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' });`, context);
    const answer = api.answerAssistantQuery('أحمد دفع كام؟', NOW);
    assert.equal(answer.id, 'resident-choice');
    assert.match(answer.html, /شقة 3/);
    assert.match(answer.html, /شقة 9/);
    assert.match(answer.html, /حدد رقم الشقة/);
});

test('arrears answers surface cumulative debt and handle the clean case', () => {
    const { context, api } = createHarness();
    vm.runInContext(`state.residents.push({ id: 'r-old', name: 'حسن قديم', apartmentNumber: '99', monthlyAmount: 50, billingStartMonth: '2020-01-01', createdAt: '2020-01-01T00:00:00.000Z' });`, context);
    const arrears = api.getAssistantArrearsSnapshot();
    assert.ok(arrears.totalDebt > 0);
    const answer = api.answerAssistantQuery('مين عليه متأخرات؟', NOW);
    assert.equal(answer.id, 'arrears');
    assert.match(answer.html, /شقة 99/);
    assert.match(answer.html, /حسن قديم/);
    assert.match(answer.html, /إجمالي المتأخرات/);

    vm.runInContext('state.residents = []; state.income = [];', context);
    const clean = api.answerAssistantQuery('مين عليه متأخرات؟', NOW);
    assert.match(clean.html, /مفيش أي متأخرات/);
    assert.equal(api.getAssistantArrearsSnapshot().totalDebt, 0);
});

test('cashbox answers show each fund and total liquidity', () => {
    const { api } = createHarness();
    const cash = api.getAssistantCashSnapshot();
    assert.equal(cash.total, 1550);
    const answer = api.answerAssistantQuery('رصيد الخزنة كام؟', NOW);
    assert.equal(answer.id, 'cashbox');
    assert.match(answer.html, /الخزنة الرئيسية/);
    assert.match(answer.html, /صندوق التطوير/);
    assert.match(answer.html, /صندوق الصيانة الطارئة/);
    assert.match(answer.html, /1,550 ج\.م/);
});

test('adjustment answers scope by month and separate waivers from discounts', () => {
    const { api } = createHarness();
    const november = api.answerAssistantQuery('الإعفاءات والتخفيضات', NOW);
    assert.equal(november.id, 'adjustments');
    assert.match(november.html, /إجمالي الإعفاءات/);
    assert.match(november.html, /30 ج\.م/);
    assert.match(november.html, /سارة حسن/);
    assert.doesNotMatch(november.html, /أحمد علي/);

    const october = api.answerAssistantQuery('إعفاءات أكتوبر 2026', NOW);
    assert.match(october.html, /إجمالي التخفيضات/);
    assert.match(october.html, /10 ج\.م/);
    assert.match(october.html, /أحمد علي/);
});

test('recent movements, building data, reports guide and help intents answer', () => {
    const { api } = createHarness();
    const recent = api.answerAssistantQuery('آخر الحركات', NOW);
    assert.equal(recent.id, 'recent');
    assert.match(recent.html, /آخر التحصيلات/);
    assert.match(recent.html, /آخر المصروفات/);
    assert.match(recent.html, /نظافة/);

    const building = api.answerAssistantQuery('بيانات العمارة', NOW);
    assert.equal(building.id, 'building');
    assert.match(building.html, /عمارة النور/);
    assert.match(building.html, /أ\. محمد/);
    assert.match(building.html, /عدد الشقق/);

    const reports = api.answerAssistantQuery('التقارير', NOW);
    assert.equal(reports.id, 'reports');
    assert.match(reports.html, /تقرير المالك/);
    assert.match(reports.html, /CSV/);

    const help = api.answerAssistantQuery('بتعرف تعمل ايه؟', NOW);
    assert.equal(help.id, 'help');
    assert.match(help.html, /ملخص الشهر/);
    assert.match(help.html, /المتأخرات/);
});

test('greeting, thanks, unknown and suggestions stay friendly and safe', () => {
    const { api } = createHarness();
    const greeting = api.answerAssistantQuery('السلام عليكم', NOW);
    assert.equal(greeting.id, 'greeting');
    assert.match(greeting.html, /عم عبده البواب/);
    assert.match(greeting.html, /نوفمبر 2026/);

    const thanks = api.answerAssistantQuery('شكرا يا عم عبده', NOW);
    assert.equal(thanks.id, 'thanks');

    const unknown = api.answerAssistantQuery('ازرق', NOW);
    assert.equal(unknown.id, 'unknown');
    assert.match(unknown.title, /مش لاقي إجابة/);
    assert.match(unknown.html, /معلش يا أستاذ/);

    assert.equal(api.ASSISTANT_SUGGESTIONS.length, 6);
    api.ASSISTANT_SUGGESTIONS.forEach(item => assert.ok(item.label && item.query));
    assert.equal(api.ASSISTANT_NAME, 'عم عبده البواب');
});

test('resident names and notes are escaped before they reach the chat bubble', () => {
    const { context, api } = createHarness();
    vm.runInContext(`state.residents[0].name = '<img src=x onerror="alert(1)">';`, context);
    const answer = api.answerAssistantQuery('شقة 3', NOW);
    const renderedTitle = api.assistantEscape(answer.title);
    assert.doesNotMatch(renderedTitle, /<img/i);
    assert.match(renderedTitle, /&lt;img/);
});

test('answers are empty-state safe when no residents or transactions exist', () => {
    const { api } = createHarness(false);
    const summary = api.answerAssistantQuery('ملخص الشهر', NOW);
    assert.equal(summary.id, 'summary');
    assert.match(summary.html, /0 ج\.م/);

    const greeting = api.buildAssistantGreetingHtml(NOW);
    assert.match(greeting, /لسه مفيش شقق مسجلة/);

    const income = api.answerAssistantQuery('تحصيل نوفمبر 2026', NOW);
    assert.match(income.html, /مفيش تحصيلات مسجلة/);

    const expenses = api.answerAssistantQuery('مصروفات نوفمبر 2026', NOW);
    assert.match(expenses.html, /مفيش مصروفات مسجلة/);
});
