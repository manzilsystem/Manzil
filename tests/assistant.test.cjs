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
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const assistantEvaluation = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'assistant-query-evaluation.json'), 'utf8'));
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

const NOTICES = [
    { id: 'n1', text: 'صيانة الأسانسير يوم الخميس', date: '2026-10-20T09:00:00.000Z' },
    { id: 'n2', text: 'قراءة العدادات الأسبوع الجاي', date: '2026-11-10T09:00:00.000Z' }
];

const OWNER_NOTIFICATIONS = [
    { id: 'on1', title: 'إيصال جديد', body: 'تم تسجيل دفعة نوفمبر', readAt: '2026-11-05T08:00:00.000Z', createdAt: '2026-11-04T08:00:00.000Z' },
    { id: 'on2', title: 'تذكير بالاشتراك', body: 'الموعد آخر الشهر', readAt: null, createdAt: '2026-11-12T08:00:00.000Z' }
];

const PAYMENT_SETTINGS = {
    cash: { enabled: true },
    wallet: { enabled: false, provider: 'فودافون كاش', accountName: 'مدير', number: '01000000000' },
    instapay: { enabled: true, accountName: 'منزل للعمارات', address: 'MANZIL.INSTA' },
    bank_transfer: { enabled: true, bankName: 'البنك الأهلي', accountName: 'منزل', iban: 'EG0000000000000000000000000' }
};

function createStorageStub() {
    const map = new Map();
    return {
        map,
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: key => { map.delete(key); }
    };
}

function createHarness(seed = true, identity = {}, options = {}) {
    const sessionStorage = createStorageStub();
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
        sessionStorage,
        crypto: { randomUUID: () => 'test-id' },
        requestAnimationFrame: callback => callback(),
        currentUserRole: 'manager',
        activeBuildingId: 'building-1'
    };
    // Optional hook so a test can swap in spies (e.g. network stubs) before the
    // sources load, without the harness having to know about them.
    if (typeof options.instrument === 'function') options.instrument(sandbox);
    const context = vm.createContext(sandbox);
    vm.runInContext(stateSource, context, { filename: 'js/state.js' });
    vm.runInContext(assistantSource, context, { filename: 'js/assistant.js' });
    vm.runInContext(`
        currentUserRole = ${JSON.stringify(identity.role || 'manager')};
        currentProfileName = ${JSON.stringify(identity.profileName === undefined ? null : identity.profileName)};
        currentResidentId = ${JSON.stringify(identity.residentId === undefined ? null : identity.residentId)};
    `, context);
    if (identity.ownerScoped) {
        vm.runInContext(`
            state.buildingName = 'عمارة النور';
            state.managerName = 'أ. محمد';
            state.managerPhone = '01000000000';
            state.defaultSubscription = 100;
            state.floorCount = 5;
            state.apartmentsPerFloor = 4;
            state.subscriptionDueDay = 5;
            state.subscriptionGraceDays = 3;
            state.paymentSettings = ${JSON.stringify(PAYMENT_SETTINGS)};
            state.residents = ${JSON.stringify(RESIDENTS.slice(0, 1))};
            state.income = ${JSON.stringify(INCOME.filter(item => item.residentId === 'r1'))};
            state.expenses = [];
            state.adjustments = ${JSON.stringify(ADJUSTMENTS.filter(item => item.residentId === 'r1'))};
            state.notices = ${JSON.stringify(NOTICES)};
            state.ownerNotifications = ${JSON.stringify(OWNER_NOTIFICATIONS)};
            state.cashAccountBalances = { main: 0, development: 0, emergency: 0 };
        `, context);
    } else if (seed) {
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
        cloneStateSnapshot,
        hasPendingStateSave,
        saveWithRollback,
        assistantAddress,
        assistantUserDisplayName,
        detectOwnerAssistantIntent,
        detectAssistantIntent,
        buildAssistantQueryPlan,
        getAssistantArrearsSnapshot,
        getAssistantCashSnapshot,
        getAssistantExpenseSnapshot,
        getAssistantIncomeSnapshot,
        getAssistantMonthSummary,
        getAssistantNowLabel,
        getAssistantResidentSnapshot,
        buildAssistantResidentAnswer,
        buildAssistantNoticesAnswer,
        buildAssistantOwnerNotificationsAnswer,
        normalizeAssistantArabic,
        resolveAssistantPeriod,
        resolveAssistantResident,
        assistantParsedAmount,
        assistantEscape,
        openAssistantOperation,
        openAssistantReports,
        buildAssistantFollowUps,
        hasAssistantTimeHint,
        assistantFollowsResident,
        resolveAssistantPeriodWithContext,
        parseAssistantMutationCommand,
        buildAssistantMutationPreview,
        cancelAssistantMutation,
        mutationDraftSnapshot: () => assistantMutationDraft,
        parseAssistantResidentEntryCommand,
        buildAssistantResidentEntryPreview,
        cancelAssistantResidentEntry,
        residentEntryDraftSnapshot: () => assistantResidentEntryDraft,
        assistantOperationRequestId,
        assistantOperationStatus: () => assistantOperationContext?.status || null,
        requireAssistantOperationReadyForCommit,
        beginAssistantOperationCommit,
        startAssistantOperationContext,
        markAssistantOperationSaveUncertain,
        completeAssistantOperation,
        clearAssistantOperationContext,
        logAction,
        assistantOperationSuccessHtml,
        confirmAssistantOperation,
        restoreAssistantSession,
        appendAssistantMessage,
        resetAssistantChat,
        chatSnapshot: () => assistantChat,
        contextSnapshot: () => assistantContext,
        ASSISTANT_NAME
    })`, context);
    return { context, api, storage: sandbox.sessionStorage };
}

test('assistant resident summary uses the agreed settlement amount and linked payments', () => {
    const { context, api } = createHarness(false);
    vm.runInContext(`
        state.defaultSubscription = 100;
        state.residents = [{
            id: 'r1', name: 'أحمد علي', apartmentNumber: '3',
            monthlyAmount: 100, billingStartMonth: '2026-01-01',
            createdAt: '2026-01-01T00:00:00.000Z'
        }];
        state.adjustments = [{
            id: 's1', residentId: 'r1', kind: 'settlement',
            effectiveMonth: '2026-11-01', amount: 60, reason: 'اتفاق تسوية'
        }];
        state.income = [{
            id: 'p1', residentId: 'r1', month: 'نوفمبر 2026',
            amount: 20, purposeCode: 'settlement', settlementAdjustmentId: 's1'
        }];
        state.expenses = [];
    `, context);
    const resident = vm.runInContext('state.residents[0]', context);
    const snapshot = api.getAssistantResidentSnapshot(resident, NOW);
    assert.equal(snapshot.subscription, 60);
    assert.equal(snapshot.paid, 20);
    assert.equal(snapshot.adjusted, 40);
    assert.equal(snapshot.settlementPaid, 20);
    assert.equal(snapshot.settlementRemaining, 40);
    assert.equal(snapshot.outstanding, 40);
    const answer = api.buildAssistantResidentAnswer(resident, NOW).html;
    assert.match(answer, /قيمة اتفاق التسوية/);
    assert.match(answer, /قيمة اتفاق التسوية/);
    assert.match(answer, /المتبقي من التسوية/);
});

test('assistant income summary keeps settlement payments separate from other purposes', () => {
    const { context, api } = createHarness(false);
    vm.runInContext(`
        state.income = [
            { id: 'p1', residentId: 'r1', month: 'نوفمبر 2026', amount: 20, purposeCode: 'settlement' },
            { id: 'p2', residentId: 'r1', month: 'نوفمبر 2026', amount: 10, purposeCode: 'development' }
        ];
    `, context);
    const snapshot = api.getAssistantIncomeSnapshot(['نوفمبر 2026']);
    assert.equal(snapshot.total, 30);
    assert.equal(snapshot.settlementTotal, 20);
    assert.equal(snapshot.otherTotal, 10);
});

test('assistant modal, launcher, script and styles are wired into the app', () => {
    assert.match(html, /id="assistantModal"/);
    assert.match(html, /id="assistantLog"[^>]*role="log"[^>]*aria-live="polite"/);
    assert.match(html, /id="assistantLog"[^>]*role="log"[^>]*aria-live="polite"/);
    assert.match(html, /id="assistantInput"[^>]*maxlength="1000"/);
    assert.match(html, /<textarea[^>]*id="assistantInput"[^>]*rows="1"/);
    assert.match(html, /id="assistantStatusText"/);
    assert.match(html, /id="assistantInputCounter"/);
    assert.match(html, /id="assistantSendButton"[^>]*disabled/);
    assert.match(html, /onkeydown="handleAssistantComposerKeydown\(event\)"/);
    assert.match(html, /oninput="updateAssistantComposerState\(\)"/);
    assert.match(html, /Shift\+Enter لسطر جديد/);
    assert.doesNotMatch(html, /assistantTools|assistantSuggestions|assistantQuickActions|مهام المدير|أسئلة مقترحة/);
    const assistantControls = assistantSource.match(/<button\b[^>]*>/gi) || [];
    assert.ok(assistantControls.length > 0, 'manager review actions are available for explicit record changes');
    assert.ok(assistantControls.every(button => /type="button"/i.test(button) && /assistant-action-(?:confirm|cancel)/i.test(button)),
        'in-chat controls are limited to explicit review confirmation and cancellation');
    assert.match(html, /onsubmit="sendAssistantMessage\(event\)"/);
    assert.match(html, /<button type="button" id="assistantFab"[^>]*onclick="openAssistantModal\(\)"/);
    assert.match(html, /aria-label="اسأل عم عبده البواب"/);
    assert.match(html, /class="assistant-avatar-frame assistant-fab-avatar"><img src="icons\/assistant-abbah-full\.png\?v=/, 'the launcher shows the full-body doorman');
    assert.match(html, /id="assistantHeadAvatar" class="assistant-avatar"><img src="icons\/assistant-abbah\.png\?v=/, 'the chat avatar uses the clear profile portrait');
    assert.match(html, /class="assistant-fab-greeting"[^>]*>نورت يا بيه! عم عبده في خدمتك 👋</, 'the doorman greets before the first click');
    assert.doesNotMatch(html, /class="assistant-fab-copy"/, 'the launcher is now a bare full-body character, not a labelled chip');
    assert.match(css, /\.assistant-avatar-frame img \{[\s\S]*filter: drop-shadow\(0 14px 34px var\(--assistant-fab-shadow\)\)/, 'the portrait casts a realistic drop shadow');
    assert.match(css, /@keyframes assistant-fab-greet/, 'the greeting is a timed animation, not permanent chrome');
    assert.match(css, /\.assistant-fab\.is-greeting \.assistant-fab-greeting \{[\s\S]*animation: assistant-fab-greet/, 'the script replays the greeting by toggling is-greeting');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.assistant-fab\.is-greeting \.assistant-fab-greeting \{ animation: none; \}/, 'reduced motion cancels the greeting animation');
    assert.doesNotMatch(html, /assistant-header-button/, 'the launcher left the header for the floating button');
    assert.ok(html.indexOf('js/assistant.js') > -1, 'assistant script is included');
    assert.ok(html.indexOf('js/assistant.js') < html.indexOf('js/app.js'), 'assistant loads before app bootstrap');
    assert.match(css, /\.assistant-fab \{/);
    assert.match(css, /\.assistant-fab\.is-hidden \{/);
    assert.match(css, /\.assistant-fab\.is-compact \{/);
    assert.match(css, /\.assistant-fab\.is-compact \.assistant-fab-avatar img \{[\s\S]*var\(--assistant-fab-shadow-compact\)/, 'scrolling only softens the portrait shadow');
    assert.match(css, /\.assistant-avatar-frame img \{[\s\S]*object-position: bottom center;[\s\S]*transform-origin: bottom center;/, 'the full-body art stays pinned to the floor while it animates');
    assert.match(css, /@keyframes assistant-fab-idle/, 'the idle breathing keeps the doorman alive');
    assert.match(css, /@keyframes assistant-fab-wave/, 'hovering waves the doorman');
    assert.match(assistantSource, /applyAssistantFabState\(false, assistantFabCompactByScroll\)/, 'scroll state only compacts the launcher');
    assert.doesNotMatch(assistantSource, /assistantFabHiddenByScroll/, 'scrolling must never hide the launcher again');
    assert.match(css, /body\.owner-mode \.assistant-fab/);
    assert.match(css, /@media print \{ \.assistant-fab \{ display: none !important; \} \}/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.assistant-fab/);
    assert.match(css, /\.assistant-avatar \{[\s\S]*width: 3\.25rem;[\s\S]*height: 3\.25rem;[\s\S]*border-radius: var\(--radius-pill\);/, 'the chat avatar is a larger circular profile frame');
    assert.match(css, /\.assistant-avatar img \{[\s\S]*object-fit: cover;[\s\S]*object-position: center;[\s\S]*transform: none;[\s\S]*transform-origin: center;/, 'the circular frame keeps the profile portrait clear');
    assert.match(css, /\.assistant-hero \{/);
    assert.match(assistantSource, /icons\/assistant-abbah-full\.png/, 'the greeting shows the full-body avatar');
    assert.match(serviceWorker, /\.\/icons\/assistant-abbah\.png/);
    assert.match(serviceWorker, /\.\/icons\/assistant-abbah-full\.png/);
    assert.match(assistantSource, /ASSISTANT_FAB_SCROLL_DEADZONE/, 'scroll direction drives the launcher');
    assert.match(assistantSource, /ASSISTANT_FOLLOWUPS/, 'follow-up knowledge remains available to the response logic');
    assert.match(assistantSource, /isSafeAssistantHtml/, 'a stored chat log is re-checked before it renders');
    assert.match(assistantSource, /sessionStorage\.setItem\(keys\.chat/, 'the chat survives reopening the assistant');
    assert.match(css, /\.assistant-typing-dot \{/);
    assert.match(css, /@keyframes assistant-typing-bounce/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.assistant-typing-dot \{ animation: none; \}/);
    assert.match(assistantSource, /window\.addEventListener\('scroll', handleAssistantFabScroll, \{ passive: true \}\)/);
    assert.match(assistantSource, /new MutationObserver\(\(\) => syncAssistantFab\(\)\)\.observe\(modal/);
    assert.doesNotMatch(assistantSource, /addEventListener\('focus'/, 'a visibility-hidden launcher is not focusable, so no focus handler is needed');
    assert.match(css, /\.assistant-msg\.is-user \.assistant-bubble/);
    assert.match(css, /\.assistant-message-meta \{/);
    assert.match(css, /\.assistant-composer-frame:focus-within/);
    assert.match(css, /\.assistant-shell\[aria-busy="true"\] \.assistant-send-spinner/);
    assert.match(css, /@media \(max-width: 640px\)[\s\S]*#assistantModal > \.assistant-shell/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.assistant-send-spinner/);
    assert.match(assistantSource, /function updateAssistantComposerState\(\)/);
    assert.match(assistantSource, /function setAssistantBusy\(isBusy/);
    assert.match(assistantSource, /function handleAssistantComposerKeydown\(event\)/);
    assert.match(assistantSource, /عم عبده بيكتب/);
    assert.match(css, /@media print \{\s*#assistantModal \{ display: none !important; \}/);
});

test('عم عبده is written-only and exposes no microphone, recording, or speech output path', () => {
    const activeSource = [assistantSource, html, css, serviceWorker, appSource].join('\n');
    for (const pattern of [
        /assistant-voice\.js/i, /assistantVoiceButton/i, /assistantVoiceDownload/i,
        /navigator\.mediaDevices/i, /getUserMedia/i, /MediaRecorder/i,
        /speechSynthesis/i, /SpeechSynthesisUtterance/i, /toggleAssistantSound/i
    ]) assert.doesNotMatch(activeSource, pattern);
    assert.match(html, /<form class="assistant-form" onsubmit="sendAssistantMessage\(event\)">[\s\S]*id="assistantInput"[\s\S]*assistant-send-button/);
    assert.doesNotMatch(appSource, /getUserMedia|MediaRecorder|speechSynthesis|SpeechSynthesisUtterance/i);
});

test('free-form typed requests start incomplete manager drafts without quick-action menus', () => {
    const { api: managerApi } = createHarness(true);
    const queries = ['سجل تحصيل', 'أضف مصروف', 'سجل إعفاء', 'اعمل تسوية'];
    for (const query of queries) {
        const answer = managerApi.answerAssistantQuery(query, NOW);
        assert.equal(answer.id, 'operation-missing', `${query} should enter the existing incomplete-draft flow`);
        assert.match(answer.html, /ناقص/);
    }
    assert.doesNotMatch(html, /assistantTools|assistantQuickActions|assistantSuggestions|مهام المدير|أسئلة مقترحة/);
    assert.doesNotMatch(assistantSource, /function populateAssistantQuickActions|function handleAssistantSuggestion/);

    const { api: ownerApi } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    for (const query of queries) {
        const answer = ownerApi.answerAssistantQuery(query, NOW);
        assert.notEqual(answer.id, 'operation-preview');
    }
});

test('an owner cannot inspect another apartment by number, resident name, or building-wide wording', () => {
    const { context, api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    vm.runInContext(`state.residents = ${JSON.stringify(RESIDENTS)}; state.income = ${JSON.stringify(INCOME)};`, context);

    for (const query of ['متأخرات شقة ٧', 'سارة حسن دفعت كام؟', 'حساب سارة حسن كام؟', 'مين عليه متأخرات؟']) {
        const answer = api.answerAssistantQuery(query, NOW);
        assert.equal(answer.id, 'owner_scope', `${query} must not resolve to the owner's own account data`);
        assert.doesNotMatch(answer.html, /سارة حسن|شقة 7|200 ج\.م|50 ج\.م/);
    }

    const own = api.answerAssistantQuery('عليّا كام؟', NOW);
    assert.equal(own.id, 'my_bill');
    assert.match(own.html, /شقة 3/);
    assert.doesNotMatch(own.html, /سارة حسن|شقة 7|200 ج\.م/);
});

test('the assistant denies unknown roles and never answers while a save is pending', async () => {
    const unauthorized = createHarness(true);
    vm.runInContext("currentUserRole = 'visitor'", unauthorized.context);
    const denied = unauthorized.api.answerAssistantQuery('رصيد الخزنة كام؟', NOW);
    assert.equal(denied.id, 'access-denied');
    assert.doesNotMatch(denied.html, /1,550|1200|الخزنة الرئيسية/);

    const { context, api } = createHarness(true);
    const previous = api.cloneStateSnapshot();
    let resolveSave;
    context.pendingSavePromise = new Promise(resolve => { resolveSave = resolve; });
    vm.runInContext('saveState = () => pendingSavePromise', context);
    vm.runInContext("state.expenses.push({ id: 'pending-secret', month: 'نوفمبر 2026', title: 'مصروف غير محفوظ', amount: 9000, category: 'اختبار' })", context);

    const save = api.saveWithRollback(previous);
    assert.equal(api.hasPendingStateSave(), true);
    const pendingAnswer = api.answerAssistantQuery('مصروفات الشهر', NOW);
    assert.equal(pendingAnswer.id, 'pending-save');
    assert.doesNotMatch(pendingAnswer.html, /9000|مصروف غير محفوظ/);
    assert.match(api.buildAssistantGreetingHtml(NOW), /عملية حفظ جارية/);

    resolveSave(false);
    assert.equal(await save, false);
    assert.equal(api.hasPendingStateSave(), false);
    const afterRollback = api.answerAssistantQuery('مصروفات الشهر', NOW);
    assert.doesNotMatch(afterRollback.html, /9000|مصروف غير محفوظ/);
});

test('avatar art is transparent PNG so it matches every theme', () => {
    const avatars = ['icons/assistant-abbah.png', 'icons/assistant-abbah-full.png'];
    for (const relative of avatars) {
        const bytes = fs.readFileSync(path.join(root, relative));
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative} is a PNG`);
        const colorType = bytes.readUInt8(25);
        assert.equal(colorType & 4, 4, `${relative} carries a real alpha channel`);
        assert.ok(bytes.includes(Buffer.from('IEND', 'ascii')), `${relative} is not truncated`);
    }
    // The head shot is a square crop; the full-body doorman is a tall portrait.
    const bust = fs.readFileSync(path.join(root, 'icons/assistant-abbah.png'));
    assert.equal(bust.readUInt32BE(16), bust.readUInt32BE(20), 'the head shot stays square');
    const full = fs.readFileSync(path.join(root, 'icons/assistant-abbah-full.png'));
    assert.ok(full.readUInt32BE(16) < full.readUInt32BE(20), 'the doorman is a tall full-body portrait');
});

test('assistant is local-only and never touches the network', () => {
    assert.doesNotMatch(assistantSource, /\bfetch\s*\(/);
    assert.doesNotMatch(assistantSource, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(assistantSource, /https?:\/\//);
    assert.doesNotMatch(assistantSource, /supabase/i);
    assert.match(assistantSource, /ومساعدك المحلي/, 'the assistant introduces itself as a local helper');
    assert.match(html, /<p><span class="assistant-online-dot" aria-hidden="true"><\/span> متاح الآن · محادثة محلية<\/p>/, 'the head keeps the local-chat status note');
});

test('assistant runtime keeps the written chat local and away from durable storage', () => {
    // Trip every outbound/durable channel: an accidental call throws so the test
    // fails loudly instead of silently reaching a service or writing to disk.
    const leaks = [];
    const instrument = sandbox => {
        const trip = channel => (...args) => {
            const head = args[0] === undefined ? '' : String(args[0]).slice(0, 40);
            leaks.push(`${channel}:${head}`);
            throw new Error(`عم عبده must stay local — blocked ${channel}`);
        };
        sandbox.fetch = trip('fetch');
        sandbox.XMLHttpRequest = function XMLHttpRequest() { return trip('XMLHttpRequest')(); };
        sandbox.WebSocket = function WebSocket() { return trip('WebSocket')(); };
        sandbox.EventSource = function EventSource() { return trip('EventSource')(); };
        sandbox.navigator = { sendBeacon: trip('sendBeacon') };
        sandbox.localStorage = { getItem: () => null, setItem: () => leaks.push('localStorage.setItem'), removeItem() {} };
    };

    const manager = createHarness(true, {}, { instrument });
    for (const query of ['ملخص الشهر', 'مين عليه متأخرات؟', 'رصيد الخزنة كام؟', 'تحصيل الشهر', 'مصروفات الشهر', 'الإعفاءات والتخفيضات', 'بيانات العمارة', 'آخر الحركات']) {
        const answer = manager.api.answerAssistantQuery(query, NOW);
        assert.ok(answer && typeof answer.html === 'string', `manager query "${query}" is answered locally`);
    }
    // Persisting and restoring the conversation must stay on-device too.
    manager.api.appendAssistantMessage('user', 'اختبار محلي');
    manager.api.restoreAssistantSession();

    const owner = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' }, { instrument });
    for (const query of ['عليّا كام الشهر ده؟', 'إيصالاتي', 'إعلانات المبنى', 'إشعاراتي', 'رقم المدير', 'رصيد الخزنة كام؟']) {
        const answer = owner.api.answerAssistantQuery(query, NOW);
        assert.ok(answer && typeof answer.html === 'string', `owner query "${query}" is answered locally`);
    }

    assert.deepEqual(leaks, [], 'no fetch/XHR/WebSocket/EventSource/sendBeacon call and no localStorage write may ever happen');

    // Static guarantees that back the runtime guard.
    assert.doesNotMatch(assistantSource, /\blocalStorage\b/, 'the assistant only ever uses sessionStorage');
    assert.doesNotMatch(assistantSource, /navigator\s*\./, 'no beacon and no microphone access from the assistant core');
    assert.doesNotMatch(assistantSource, /supabaseClient|\.rpc\(|\.from\(\s*['"]/, 'the assistant reads `state` only — never the database directly');
});

test('assistant answers stay read-only until the explicit operation confirmation', () => {
    // Parsing and previewing must leave the application state untouched. The
    // separate confirmation action is the only path allowed to call a save form.
    const snapshotState = context => JSON.stringify(vm.runInContext('state', context));

    const manager = createHarness(true);
    const managerBefore = snapshotState(manager.context);
    const managerQueries = [
        'ملخص أكتوبر 2026', 'ملخص نوفمبر 2026', 'مين عليه متأخرات؟', 'رصيد الخزنة كام؟',
        'تحصيل الشهر', 'مصروفات الشهر', 'الإعفاءات والتخفيضات', 'بيانات العمارة', 'آخر الحركات',
        'سجّل دفعة لأحمد', 'أضف مصروف كهرباء', 'احذف مصروف النظافة', 'اعمل إيصال لأحمد', 'عدّل مصروف'
    ];
    for (const query of managerQueries) {
        const answer = manager.api.answerAssistantQuery(query, NOW);
        assert.ok(answer && typeof answer.html === 'string', `"${query}" is answered without throwing`);
    }
    assert.equal(snapshotState(manager.context), managerBefore, 'answering never mutates application state');

    const owner = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    const ownerBefore = snapshotState(owner.context);
    for (const query of ['عليّا كام الشهر ده؟', 'إيصالاتي', 'إعلانات المبنى', 'إشعاراتي', 'رقم المدير', 'سجّل دفعة', 'احذف مصروف']) {
        owner.api.answerAssistantQuery(query, NOW);
    }
    assert.equal(snapshotState(owner.context), ownerBefore, 'owner answers are read-only too');

    // Source-level: the assistant does not assign records itself or reach the
    // database; it delegates a confirmed operation to the existing form flow.
    assert.doesNotMatch(assistantSource, /\bstate\s*(?:\.\s*[\w$]+|\[[^\]]+\])\s*=(?!=)/, 'the assistant never assigns into `state`');
    assert.doesNotMatch(assistantSource, /supabaseClient|\.rpc\(|\.from\(\s*['"][^'"]*['"]\s*\)[\s\S]{0,40}\.(?:insert|update|upsert|delete)\b/, 'no database write path is reachable');
    assert.doesNotMatch(assistantSource, /\b(?:addIncome|addExpense|saveState|persistState|deleteResident|deleteIncome|deleteExpense)\s*\(/, 'no mutation helpers are wired into the assistant');
});

test('manager announcement commands create a preview with explicit confirmation only', () => {
    const { context, api } = createHarness(true);
    const before = JSON.stringify(vm.runInContext('state', context));
    const answer = api.answerAssistantQuery('اكتب إعلان: سيتم إيقاف الأسانسير غدًا للصيانة', NOW);

    assert.equal(answer.id, 'notice-preview');
    assert.match(answer.html, /اكتب «انشر الإعلان»/);
    assert.doesNotMatch(answer.html, /<button/i);
    assert.match(answer.html, /سيتم إيقاف الأسانسير غدًا للصيانة/);
    assert.equal(JSON.stringify(vm.runInContext('state', context)), before);
});

test('manager report answers expose a role-safe direct navigation action', () => {
    assert.match(assistantSource, /function openAssistantReports\(reportTab = 'landlord'\)/);
    assert.match(assistantSource, /function closeAssistantForNavigation\(\)/);
    assert.match(assistantSource, /if \(!closeAssistantForNavigation\(\)\) return false;/);
    assert.match(assistantSource, /openAssistantReports\(\)/);
    assert.match(assistantSource, /افتح شاشة التقارير/);
    assert.match(assistantSource, /if \(assistantIsOwner\(\)\) return false;/);
});

test('typed navigation and operation-form requests close the assistant before opening official screens', () => {
    const calls = [];
    let assistantOpen = true;
    const { context, api } = createHarness(true, {}, {
        instrument: sandbox => {
            const modal = { classList: { contains: name => name === 'hidden' && !assistantOpen } };
            sandbox.document.getElementById = id => id === 'assistantModal' ? modal : null;
            sandbox.closeModal = id => { calls.push(`close:${id}`); assistantOpen = false; };
            sandbox.switchTab = tab => calls.push(`tab:${tab}`);
            sandbox.switchReportTab = tab => calls.push(`report:${tab}`);
            sandbox.setTimeout = callback => { callback(); return 0; };
            sandbox.openAssistantExpenseDraft = () => calls.push('expense-form');
            sandbox.openNoticeModal = () => calls.push('notice-form');
        }
    });

    assert.equal(api.openAssistantReports('expenses'), true);
    assert.deepEqual(calls, ['close:assistantModal', 'tab:reports', 'report:expenses']);

    calls.length = 0;
    assistantOpen = true;
    vm.runInContext("assistantOperationDraft = { type: 'expense' }", context);
    assert.equal(api.openAssistantOperation(), true);
    assert.deepEqual(calls, ['close:assistantModal', 'expense-form']);

    calls.length = 0;
    assistantOpen = true;
    const openScreen = api.answerAssistantQuery('افتح شاشة التقارير', NOW);
    assert.equal(openScreen.id, 'reports-open-request');
    assert.equal(api.openAssistantReports(), true);
    assert.deepEqual(calls, ['close:assistantModal', 'tab:reports', 'report:landlord']);
});

test('announcement drafts use typed publish/cancel commands and responses contain no buttons', () => {
    const { api } = createHarness(true);
    const draft = api.answerAssistantQuery('اكتب إعلان صيانة الأسانسير يوم الخميس', NOW);
    assert.equal(draft.id, 'notice-preview');
    assert.match(draft.html, /اكتب «انشر الإعلان»/);
    assert.doesNotMatch(draft.html, /<button/i);
    const publish = api.answerAssistantQuery('انشر الإعلان', NOW);
    assert.equal(publish.id, 'notice-confirm-request');
    const cancel = api.answerAssistantQuery('إلغاء الإعلان', NOW);
    assert.equal(cancel.id, 'operation-cancelled');
    assert.match(cancel.html, /لم يتم حفظ أي تغيير/);
});

test('manager report requests return the selected report figures directly in chat', () => {
    const { api } = createHarness(true);
    const expenses = api.answerAssistantQuery('تقرير المصروفات عن نوفمبر 2026', NOW);
    assert.equal(expenses.id, 'reports');
    assert.match(expenses.title, /تقرير المصروفات.*نوفمبر 2026/);
    assert.match(expenses.html, /إجمالي المصروفات/);
    assert.match(expenses.html, /نظافة/);
    assert.doesNotMatch(expenses.html, /<button/i);

    const income = api.answerAssistantQuery('تقرير التحصيل نوفمبر 2026', NOW);
    assert.equal(income.id, 'reports');
    assert.match(income.title, /تقرير التحصيل/);
    assert.match(income.html, /إجمالي التحصيل/);

    const statement = api.answerAssistantQuery('كشف حساب سارة حسن شقة 7', NOW);
    assert.equal(statement.id, 'reports');
    assert.match(statement.title, /سارة حسن/);
});

test('owners never receive executable report navigation actions', () => {
    const { api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    const answer = api.answerAssistantQuery('تقرير المصروفات عن نوفمبر 2026', NOW);
    assert.notEqual(answer.id, 'reports');
    assert.doesNotMatch(answer.html, /فتح التقرير المطلوب/);
});

test('manager operation commands produce safe previews without mutating state', () => {
    const { context, api } = createHarness(true);
    const before = JSON.stringify(vm.runInContext('state', context));
    const income = api.answerAssistantQuery('سجّل تحصيل 500 جنيه من سارة حسن شقة 7 عن نوفمبر 2026', NOW);
    const expense = api.answerAssistantQuery('أضف مصروف كهرباء 800 جنيه عن نوفمبر 2026', NOW);
    const adjustment = api.answerAssistantQuery('اعمل إعفاء 100 جنيه لسارة حسن شقة 7 عن نوفمبر 2026', NOW);

    assert.equal(income.id, 'operation-missing');
    assert.match(income.html, /طريقة الدفع/);
    assert.equal(expense.id, 'operation-preview');
    assert.match(expense.html, /كهرباء/);
    assert.equal(adjustment.id, 'operation-missing');
    assert.match(adjustment.html, /سبب الإجراء/);
    assert.equal(JSON.stringify(vm.runInContext('state', context)), before);
});
test('local language rules understand short collection and expense commands and require typed confirmation', () => {
    const { context, api } = createHarness(true);
    const before = JSON.stringify(vm.runInContext('state', context));
    const expense = api.answerAssistantQuery('قيد مصروف كهرباء ٣٠٠ جنيه عن نوفمبر 2026', NOW);
    assert.equal(expense.id, 'operation-preview');
    assert.match(expense.html, /كهرباء/);
    assert.match(expense.title, /معاينة مصروف/);
    assert.match(expense.html, /أكد التسجيل/);

    const missing = api.answerAssistantQuery('قيد مصروف', NOW);
    assert.equal(missing.id, 'operation-missing');
    assert.match(missing.html, /المبلغ/);
    assert.match(missing.html, /وصف المصروف/);

    const collection = api.answerAssistantQuery('اعمل تحصيل 250 من سارة حسن شقة 7 كاش', NOW);
    assert.equal(collection.id, 'operation-preview');
    assert.match(collection.html, /250/);
    assert.match(collection.html, /سارة حسن/);
    assert.match(collection.html, /نقدي/);
    assert.doesNotMatch(collection.html, /<button/i);

    const confirmation = api.answerAssistantQuery('نعم', NOW);
    assert.equal(confirmation.id, 'operation-confirm-request');
    assert.equal(JSON.stringify(vm.runInContext('state', context)), before, 'drafting and typed confirmation prompts never write application state');
    const cancellation = api.answerAssistantQuery('الغاء', NOW);
    assert.equal(cancellation.id, 'operation-cancelled');
    assert.equal(JSON.stringify(vm.runInContext('state', context)), before);
});
test('complete manager operation previews expose a second explicit save action', () => {
    const { api } = createHarness(true);
    const answer = api.answerAssistantQuery('سجّل تحصيل 500 جنيه من سارة حسن شقة 7 عن نوفمبر 2026 نقدي في الخزنة الرئيسية', NOW);
    assert.equal(answer.id, 'operation-preview');
    assert.match(answer.html, /أكد التسجيل/);
    assert.match(answer.html, /نقدي/);
    assert.match(answer.html, /الخزنة الرئيسية/);
});
test('expense previews warn about main-vault overdraft and block an insufficient dedicated fund', () => {
    const { context, api } = createHarness(true);
    vm.runInContext(`getCashAccountBalance = code => ({ main: 1200, development: 300, emergency: 50 }[code] || 0)`, context);

    const mainVault = api.answerAssistantQuery('أضف مصروف كهرباء 1300 جنيه عن نوفمبر 2026 في الخزنة الرئيسية', NOW);
    assert.match(mainVault.html, /سيصبح .* بعد المصروف/);
    assert.match(mainVault.html, /سيُسجَّل ذلك في سجل التدقيق/);
    assert.match(mainVault.html, /أكد التسجيل/);

    const development = api.answerAssistantQuery('أضف مصروف صيانة 400 جنيه عن نوفمبر 2026 في صندوق التطوير', NOW);
    assert.match(development.html, /رصيد صندوق التطوير .* لا يكفي/);
    assert.doesNotMatch(development.html, /أكد التسجيل/);
});

test('manager can prepare a new resident from a natural-language request without saving before confirmation', () => {
    const { context, api } = createHarness(true);
    const before = JSON.stringify(vm.runInContext('state.residents', context));
    const answer = api.answerAssistantQuery('أضف ساكن كريم محمود شقة 9 اشتراك 350 جنيه هاتف 01012345678', NOW);
    assert.equal(answer.id, 'operation-preview');
    assert.match(answer.html, /كريم محمود/);
    assert.match(answer.html, /شقة 9/);
    assert.match(answer.html, /350/);
    assert.match(answer.html, /أكد التسجيل/);
    assert.equal(JSON.stringify(vm.runInContext('state.residents', context)), before);
    assert.match(assistantSource, /openAssistantResidentDraft/);
});

test('generic apartment shortcuts enter the chat operation flow', () => {
    const { api } = createHarness(true);
    const add = api.answerAssistantQuery('أضف شقة', NOW);
    assert.equal(add.id, 'operation-missing');
    assert.match(add.html, /المالك|رقم الشقة/);
    const edit = api.answerAssistantQuery('عدّل بيانات شقة', NOW);
    assert.equal(edit.id, 'operation-missing');
    assert.match(edit.html, /المالك|رقم الشقة/);
});

test('resident creation requests never become manager forms for owners', () => {
    const { api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    const answer = api.answerAssistantQuery('أضف ساكن كريم شقة 9 اشتراك 350 جنيه', NOW);
    assert.notEqual(answer.id, 'operation-preview');
});

test('manager can prepare a resident edit through the official form path without mutating state', () => {
    const { context, api } = createHarness(true);
    const before = JSON.stringify(vm.runInContext('state.residents', context));
    const answer = api.answerAssistantQuery('عدّل بيانات سارة حسن شقة 7 هاتف 01099999999', NOW);
    assert.equal(answer.id, 'operation-preview');
    assert.match(answer.html, /سارة حسن/);
    assert.match(answer.html, /01099999999/);
    assert.match(answer.html, /أكد التسجيل/);
    assert.equal(JSON.stringify(vm.runInContext('state.residents', context)), before);
    assert.match(assistantSource, /draft\.type === 'resident_edit'/);
});

test('operation parser understands local amount formats without confusing apartment or year numbers', () => {
    const { api } = createHarness(true);
    assert.equal(api.assistantParsedAmount('سجّل تحصيل من شقة ٧ عن نوفمبر ٢٠٢٦ بمبلغ ١٬٥٠٠ جنيه'), 1500);
    assert.equal(api.assistantParsedAmount('أضف مصروف 1,250 جنيه'), 1250);
    assert.equal(api.assistantParsedAmount('أضف مصروف نصف ألف جنيه'), 500);
    assert.equal(api.assistantParsedAmount('سجّل تحصيل من شقة ٧ عن نوفمبر ٢٠٢٦'), null);
});
test('short manager commands accept Arabic digits and sadded payment wording', () => {
    const { api } = createHarness(true);
    const answer = api.answerAssistantQuery('سجّل سداد ١٬٥٠٠ جنيه لسارة حسن من شقة ٧ عن نوفمبر ٢٠٢٦ نقدي', NOW);
    assert.equal(answer.id, 'operation-preview');
    assert.match(answer.html, /١|1|1500/);
    assert.match(answer.html, /سارة حسن/);
});
test('natural paid subscription wording becomes a confirmation flow', () => {
    const { api } = createHarness(true);
    const incomplete = api.answerAssistantQuery('سجل ان سارة حسن دفعت 200 اشتراك شهر نوفمبر 2026', NOW);
    assert.equal(incomplete.id, 'operation-missing');
    assert.match(incomplete.html, /طريقة الدفع/);
    const preview = api.answerAssistantQuery('نقدي', NOW);
    assert.equal(preview.id, 'operation-preview');
    assert.match(preview.html, /سارة حسن/);
    assert.match(preview.html, /200/);
    assert.match(preview.html, /نوفمبر 2026/);
    assert.match(preview.html, /أكد التسجيل/);
});
test('a missing operation can be completed in the next manager message', () => {
    const { api } = createHarness(true);
    assert.equal(api.answerAssistantQuery('سجّل تحصيل 500 جنيه من سارة حسن شقة 7 عن نوفمبر 2026', NOW).id, 'operation-missing');
    const completed = api.answerAssistantQuery('نقدي في الخزنة الرئيسية', NOW);
    assert.equal(completed.id, 'operation-preview');
    assert.match(completed.html, /أكد التسجيل/);
});
test('operation follow-ups update the draft and explain every changed field', () => {
    const { api } = createHarness(true);
    assert.equal(api.answerAssistantQuery('سجّل تحصيل من شقة 7 عن نوفمبر 2026', NOW).id, 'operation-missing');
    const updated = api.answerAssistantQuery('خلي المبلغ ٧٠٠ جنيه نقدي في صندوق التطوير عن ديسمبر ٢٠٢٦', NOW);
    assert.equal(updated.id, 'operation-preview');
    assert.match(updated.html, /اتعدلت المسودة/);
    assert.match(updated.html, /المبلغ/);
    assert.match(updated.html, /ديسمبر 2026/);
    assert.match(updated.html, /صندوق التطوير/);
    assert.match(updated.html, /أكد التسجيل/);
});
test('explicit operation confirmation uses the official save handler without opening forms or closing chat', async () => {
    const { context, api } = createHarness(true);
    vm.runInContext(`
        assistantModalClosed = false;
        assistantFormShowModal = null;
        assistantFromChat = false;
        closeModal = () => { assistantModalClosed = true; };
        openAssistantIncomeDraft = (draft, options) => { assistantFormShowModal = options.showModal; return true; };
        handleIncomeSubmit = async event => {
            assistantFromChat = event.assistantFromChat;
            state.income.push({ id: 'assistant-confirmed' });
        };
    `, context);
    api.answerAssistantQuery('سجّل تحصيل 500 جنيه من سارة حسن شقة 7 عن نوفمبر 2026 نقدي في الخزنة الرئيسية', NOW);
    const before = vm.runInContext('state.income.length', context);
    const saved = await api.confirmAssistantOperation();
    assert.equal(saved, true);
    assert.equal(vm.runInContext('state.income.length', context), before + 1);
    assert.equal(vm.runInContext('state.income.at(-1).id', context), 'assistant-confirmed');
    assert.equal(vm.runInContext('assistantFormShowModal', context), false);
    assert.equal(vm.runInContext('assistantFromChat', context), true);
    assert.equal(vm.runInContext('assistantModalClosed', context), false);
    assert.match(api.chatSnapshot().at(-1).html, /تم حفظ التحصيل بنجاح/);
});

test('failed official save keeps the operation draft and explains the validation error in chat', async () => {
    const { context, api } = createHarness(true);
    vm.runInContext(`
        toast = () => {};
        openAssistantIncomeDraft = () => true;
        handleIncomeSubmit = async () => { toast('اختر شهرًا واحدًا على الأقل.', 'error'); };
    `, context);
    api.answerAssistantQuery('سجّل تحصيل 500 جنيه من سارة حسن شقة 7 عن نوفمبر 2026 نقدي في الخزنة الرئيسية', NOW);

    assert.equal(await api.confirmAssistantOperation(), false);
    assert.match(api.chatSnapshot().at(-1).html, /اختر شهرًا واحدًا على الأقل/);
    assert.match(api.chatSnapshot().at(-1).html, /افتح النموذج للمراجعة/);
});

test('confirmed operations return a clear in-chat result with next steps', () => {
    const { api } = createHarness(true);
    const html = api.assistantOperationSuccessHtml({
        type: 'income',
        amount: 500,
        month: 'نوفمبر 2026',
        resident: RESIDENTS[1]
    });
    assert.match(html, /تم حفظ التحصيل بنجاح/);
    assert.match(html, /سارة حسن/);
    assert.match(html, /ملخص الشهر/);
    assert.match(html, /آخر الحركات/);
});

test('owners cannot turn assistant operation commands into manager forms', () => {
    const { api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    const answer = api.answerAssistantQuery('سجّل تحصيل 500 جنيه من سارة حسن شقة 7', NOW);
    assert.notEqual(answer.id, 'operation-preview');
    assert.match(answer.html, /مش متاحة|صلاحيات|حسابك|شقتك/);
});

test('assistant money figures equal the reference billing values', () => {
    const { context, api } = createHarness(true);
    const period = api.resolveAssistantPeriod('نوفمبر 2026', NOW);
    assert.equal(period.month, 'نوفمبر 2026');

    // The manager-visible raw records are the reference the assistant must echo.
    const monthRows = rows => rows.filter(row => row.month === 'نوفمبر 2026');
    const cents = rows => rows.reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0);

    const income = api.getAssistantIncomeSnapshot(period.months);
    assert.equal(income.count, monthRows(INCOME).length);
    assert.equal(income.cents, cents(monthRows(INCOME)), 'income total equals the raw payments');
    assert.equal(income.subscriptionCents, cents(monthRows(INCOME).filter(row => row.purposeCode === 'subscription')));
    assert.equal(income.otherTotal, (income.cents - income.subscriptionCents - income.settlementCents) / 100);

    const expenses = api.getAssistantExpenseSnapshot(period.months);
    assert.equal(expenses.cents, cents(monthRows(EXPENSES)), 'expense total equals the raw expenses');

    const cash = api.getAssistantCashSnapshot();
    assert.deepEqual([...cash.balances.map(item => item.amount)], [1200, 300, 50]);
    assert.equal(cash.total, 1550);

    const summary = api.getAssistantMonthSummary(period, NOW);
    assert.equal(summary.income.cents, income.cents);
    assert.equal(summary.expenses.cents, expenses.cents);
    assert.equal(summary.net, (income.cents - expenses.cents) / 100);

    // Dues, outstanding and arrears must come from the canonical state.js helpers.
    const reference = vm.runInContext(`(() => {
        const month = 'نوفمبر 2026';
        let due = 0, outstanding = 0;
        state.residents.forEach(resident => {
            due += Math.round(Number(getSubscriptionAmountForMonth(resident, month)) * 100);
            outstanding += Math.round(Number(getMonthOutstanding(resident, month)) * 100);
        });
        return {
            dueTotal: due / 100,
            outstandingTotal: outstanding / 100,
            arrearsTotal: Number(buildArrearsReport().totalDebt) || 0
        };
    })()`, context);
    assert.equal(summary.dueTotal, reference.dueTotal, 'monthly dues match getSubscriptionAmountForMonth');
    assert.equal(summary.outstandingTotal, reference.outstandingTotal, 'outstanding matches getMonthOutstanding');
    assert.equal(api.getAssistantArrearsSnapshot().totalDebt, reference.arrearsTotal, 'arrears match buildArrearsReport');

    // The per-resident snapshot stays on the same source of truth.
    const resident = vm.runInContext('state.residents[0]', context);
    const liveOutstanding = vm.runInContext("Number(getMonthOutstanding(state.residents[0], 'نوفمبر 2026')) || 0", context);
    assert.equal(api.getAssistantResidentSnapshot(resident, NOW).outstanding, liveOutstanding);
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
    assert.equal(api.resolveAssistantPeriod('تحصيل شهر سبعه 2025', NOW).label, 'يوليو 2025');
    const year = api.resolveAssistantPeriod('مصروفات سنة 2025', NOW);
    assert.equal(year.type, 'year');
    assert.equal(year.months.length, 12);
    assert.equal(year.months[0], 'يناير 2025');
    assert.equal(api.resolveAssistantPeriod('كل الفتره', NOW).type, 'all');
    assert.equal(api.hasAssistantTimeHint('عايز أعرف اللي حصل دلوقتي'), true);
});

test('common Egyptian colloquial aliases reach the matching answer', () => {
    const { api } = createHarness(true);
    assert.equal(api.answerAssistantQuery('عايز أعرف المتحصلات', NOW).id, 'income');
    assert.equal(api.answerAssistantQuery('اللي اتصرف في نوفمبر', NOW).id, 'expenses');
    assert.equal(api.answerAssistantQuery('فلوس الخزنة كام؟', NOW).id, 'cashbox');
    assert.equal(api.answerAssistantQuery('فيه جديد في العمارة؟', NOW).id, 'notices');
});

test('comparison answers use the selected month and its immediately previous month', () => {
    const { api } = createHarness(true);
    const answer = api.answerAssistantQuery('قارن نوفمبر 2026 بأكتوبر', NOW);
    assert.equal(answer.id, 'comparison');
    assert.match(answer.title, /نوفمبر 2026 وأكتوبر 2026/);
    assert.match(answer.html, /التحصيل/);
    assert.match(answer.html, /المصروفات/);
    assert.match(answer.html, /انخفاض 10 ج\.م/);
    assert.match(answer.html, /زيادة 75 ج\.م/);
});

test('payment breakdown answers aggregate the selected period by method', () => {
    const { context, api } = createHarness();
    vm.runInContext(`state.income = [
        { id: 'cash-1', residentId: 'r1', month: 'نوفمبر 2026', amount: 70, paymentMethod: 'cash' },
        { id: 'cash-2', residentId: 'r2', month: 'نوفمبر 2026', amount: 30, paymentMethod: 'cash' },
        { id: 'insta-1', residentId: 'r1', month: 'نوفمبر 2026', amount: 40, paymentMethod: 'instapay' },
        { id: 'old', residentId: 'r1', month: 'أكتوبر 2026', amount: 999, paymentMethod: 'bank_transfer' }
    ];`, context);
    const answer = api.answerAssistantQuery('التحصيلات اتدفعت بإيه في نوفمبر 2026؟', NOW);
    assert.equal(answer.id, 'payment_breakdown');
    assert.match(answer.html, /نقدًا/);
    assert.match(answer.html, /100 ج\.م/);
    assert.match(answer.html, /InstaPay/);
    assert.match(answer.html, /40 ج\.م/);
    assert.doesNotMatch(answer.html, /999 ج\.م/);
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

test('top expense answers sort only the selected period', () => {
    const { context, api } = createHarness();
    vm.runInContext(`state.expenses = [
        { id: 'big', month: 'نوفمبر 2026', title: 'إصلاح المصعد', amount: 180, category: 'صيانة' },
        { id: 'small', month: 'نوفمبر 2026', title: 'لمبات', amount: 25, category: 'كهرباء' },
        { id: 'old', month: 'أكتوبر 2026', title: 'مصروف قديم', amount: 999, category: 'قديم' }
    ];`, context);
    const answer = api.answerAssistantQuery('أكبر المصروفات في نوفمبر 2026؟', NOW);
    assert.equal(answer.id, 'top_expenses');
    assert.match(answer.html, /إصلاح المصعد/);
    assert.match(answer.html, /180 ج\.م/);
    assert.match(answer.html, /لمبات/);
    assert.doesNotMatch(answer.html, /مصروف قديم|999 ج\.م/);
    assert.ok(answer.html.indexOf('إصلاح المصعد') < answer.html.indexOf('لمبات'));
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

test('change alerts flag large period shifts without claiming a diagnosis', () => {
    const { context, api } = createHarness();
    vm.runInContext(`state.income = [
        { id: 'current', residentId: 'r1', month: 'نوفمبر 2026', amount: 300, paymentMethod: 'cash' },
        { id: 'previous', residentId: 'r1', month: 'أكتوبر 2026', amount: 100, paymentMethod: 'cash' }
    ]; state.expenses = [
        { id: 'current-expense', month: 'نوفمبر 2026', title: 'صيانة', amount: 20 },
        { id: 'previous-expense', month: 'أكتوبر 2026', title: 'صيانة', amount: 80 }
    ];`, context);
    const answer = api.answerAssistantQuery('إيه اللي اتغير بشكل غير طبيعي في نوفمبر 2026؟', NOW);
    assert.equal(answer.id, 'change_alerts');
    assert.match(answer.html, /التحصيل/);
    assert.match(answer.html, /زيادة/);
    assert.match(answer.html, /المصروفات/);
    assert.match(answer.html, /مصدر الأرقام/);
    assert.match(answer.html, /مؤشرات للمراجعة/);
    assert.match(answer.html, /تفصيل التحصيل/);
    assert.match(answer.html, /أكبر بند مصروف/);
    assert.match(answer.html, /نقد/);
    assert.deepEqual(Array.from(answer.followUps, item => item.query), [
        'تحصيل نوفمبر 2026',
        'أكبر المصروفات نوفمبر 2026',
        'ملخص نوفمبر 2026'
    ]);
    assert.doesNotMatch(answer.html, /data-assistant-query=/);
});
test('owners cannot reach manager-only change details', () => {
    const { api } = createHarness(true, { role: 'owner', residentId: 'r1', ownerScoped: true });
    const answer = api.answerAssistantQuery('إيه اللي اتغير بشكل غير طبيعي؟', NOW);
    assert.equal(answer.id, 'owner_scope');
    assert.doesNotMatch(answer.html, /تفصيل التحصيل|أكبر بند مصروف|مصدر الأرقام/);
    assert.doesNotMatch(answer.html, /ج\.م/);
});
test('executive summary combines period metrics with cumulative management signals', () => {
    const { api } = createHarness();
    const answer = api.answerAssistantQuery('ملخص تنفيذي نوفمبر 2026', NOW);
    assert.equal(answer.id, 'executive');
    assert.match(answer.title, /نوفمبر 2026/);
    assert.match(answer.html, /التحصيل/);
    assert.match(answer.html, /المصروفات/);
    assert.match(answer.html, /إجمالي السيولة/);
    assert.match(answer.html, /المتأخرات المتراكمة/);
    assert.match(answer.html, /تخص الفترة المحددة/);
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

test('summary keeps dues and outstanding balances in the requested month', () => {
    const { api } = createHarness(true);
    const october = api.answerAssistantQuery('ملخص أكتوبر 2026', NOW);
    assert.equal(october.id, 'summary');
    assert.match(october.title, /أكتوبر 2026/);
    assert.match(october.html, /مستحق أكتوبر 2026/);
    assert.match(october.html, /غير محصل أكتوبر 2026/);
    assert.match(october.html, /90 ج\.م/);
    assert.doesNotMatch(october.html, /غير محصل نوفمبر 2026/);
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

    const byWordApartment = api.answerAssistantQuery('شقة سبعة دفع كام؟', NOW);
    assert.equal(byWordApartment.id, 'resident');
    assert.match(byWordApartment.title, /شقة 7/);
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

test('arrears answers explain the oldest unpaid month and longest delay', () => {
    const { context, api } = createHarness();
    const answer = api.answerAssistantQuery('مين عليه متأخرات؟', NOW);
    assert.equal(answer.id, 'arrears');
    assert.match(answer.html, /أقدم شهر غير مسدد/);
    assert.match(answer.html, /أطول مدة تأخر/);
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

test('manager task list turns outstanding balances into prioritized follow-up actions', () => {
    const { api } = createHarness();
    const answer = api.answerAssistantQuery('اعمل قائمة متابعة للمدير', NOW);
    assert.equal(answer.id, 'manager_tasks');
    assert.match(answer.title, /قائمة متابعة المدير/);
    assert.match(answer.html, /اتصالات التحصيل المقترحة|تحصيلات الشهر المقترحة/);
    assert.match(answer.html, /سارة حسن/);
    assert.match(answer.html, /اكتب «تقرير المتأخرات»/);
    assert.match(answer.html, /ليست إرسالًا تلقائيًا/);

    const owner = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    assert.notEqual(owner.api.answerAssistantQuery('مهام المدير', NOW).id, 'manager_tasks');
});

test('chat answers multiple manager questions in one structured response', () => {
    const { api } = createHarness();
    const answer = api.answerAssistantQuery('اعمل ملخص نوفمبر 2026 وقولي التحصيل والمتأخرات', NOW);
    assert.equal(answer.id, 'compound');
    assert.equal(answer.title, 'إجابة مجمعة');
    assert.match(answer.html, /ملخص نوفمبر 2026/);
    assert.match(answer.html, /إجمالي التحصيل|التحصيل/);
    assert.match(answer.html, /إجمالي المتأخرات/);
    assert.match(answer.html, /سؤال متابعة طبيعي/);
});

test('assistant normalizes Egyptian colloquial aliases before intent detection', () => {
    const { api } = createHarness();
    assert.equal(api.answerAssistantQuery('دلوقتي كام في الخزنة؟', NOW).id, 'cashbox');
    assert.equal(api.answerAssistantQuery('الفلوس راحت فين؟', NOW).id, 'expenses');
    assert.equal(api.answerAssistantQuery('مين لسه مادفعش؟', NOW).id, 'arrears');
    assert.equal(api.answerAssistantQuery('دفعوا ازاي؟', NOW).id, 'payment_breakdown');
});

test('assistant combines colloquial questions across liquidity, expenses and arrears', () => {
    const { api } = createHarness();
    const answer = api.answerAssistantQuery('عايز أعرف فلوسنا راحت فين وكمان مين لسه مادفعش ورصيد الصندوق كام؟', NOW);
    assert.equal(answer.id, 'compound');
    assert.match(answer.html, /المصروفات/);
    assert.match(answer.html, /المتأخرات/);
    assert.match(answer.html, /الخزنة|الصندوق/);
});

test('assistant understands terse subjects and controls report detail level', () => {
    const { api } = createHarness();
    const expensePlan = api.buildAssistantQueryPlan('كهرباء', NOW);
    assert.equal(Array.from(expensePlan.intentIds).join(','), 'expenses');
    assert.equal(expensePlan.expenseCategory, 'كهرباء');
    assert.equal(expensePlan.responseMode, 'summary');

    const electricity = api.answerAssistantQuery('كهرباء', NOW);
    assert.equal(electricity.id, 'expenses');
    assert.match(electricity.title, /كهرباء/);
    assert.match(electricity.html, /كهرباء/);
    assert.doesNotMatch(electricity.html, /نظافة/);

    const brief = api.answerAssistantQuery('تقرير مختصر عن المدفوع', NOW);
    assert.equal(brief.id, 'income');
    assert.doesNotMatch(brief.html, /سارة حسن/);
    assert.match(brief.html, /ملخص سريع/);

    const detailed = api.answerAssistantQuery('تقرير مفصل عن المصروفات', NOW);
    assert.equal(detailed.id, 'expenses');
    assert.match(detailed.title, /تفاصيل/);
    assert.match(detailed.html, /كهرباء/);
    assert.match(detailed.html, /٢٠٢٦|2026/);

    const commonTypo = api.answerAssistantQuery('تقري مفلص عن المصروفات', NOW);
    assert.equal(commonTypo.id, 'expenses');
    assert.match(commonTypo.title, /تفاصيل/);
});

test('assistant fixed evaluation set keeps intent, period, apartment and role scope accurate', () => {
    const results = [];
    for (const example of assistantEvaluation.cases) {
        const identity = example.role === 'owner'
            ? { role: 'owner', residentId: 'r1', ownerScoped: true }
            : { role: 'manager' };
        const { api } = createHarness(true, identity);
        const plan = api.buildAssistantQueryPlan(example.query, NOW);
        const actual = {
            intentIds: plan.intentIds,
            periodLabel: plan.period.label,
            scope: plan.scope,
            scopeViolation: Boolean(plan.scopeViolation),
            apartmentNumber: plan.apartment ? String(plan.apartment.number) : null
        };
        const expected = {
            intentIds: example.intentIds,
            periodLabel: example.periodLabel,
            scope: example.scope,
            scopeViolation: Boolean(example.scopeViolation),
            apartmentNumber: example.apartmentNumber || null
        };
        const answer = api.answerAssistantQuery(example.query, NOW);
        const failures = [];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            failures.push(`plan expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
        if (example.responseId && answer.id !== example.responseId) {
            failures.push(`response expected ${example.responseId}, got ${answer.id}`);
        }
        if (example.responseMode && plan.responseMode !== example.responseMode) {
            failures.push(`response mode expected ${example.responseMode}, got ${plan.responseMode}`);
        }
        if (Object.prototype.hasOwnProperty.call(example, 'expenseCategory') && plan.expenseCategory !== example.expenseCategory) {
            failures.push(`expense category expected ${example.expenseCategory}, got ${plan.expenseCategory}`);
        }
        if (answer.id === 'compound') {
            const renderedIntents = Array.from(answer.html.matchAll(/data-assistant-intent="([^"]+)"/g), match => match[1]);
            if (JSON.stringify(renderedIntents) !== JSON.stringify(plan.intentIds)) {
                failures.push(`compound sections rendered as ${JSON.stringify(renderedIntents)}`);
            }
        }
        results.push({
            id: example.id,
            role: example.role,
            critical: Boolean(example.critical),
            passed: failures.length === 0,
            failures,
            expected,
            actual,
            responseId: answer.id
        });
    }
    const passed = results.filter(result => result.passed).length;
    const failed = results.length - passed;
    const passRate = results.length ? passed / results.length : 0;
    const criticalFailures = results.filter(result => result.critical && !result.passed).map(result => result.id);
    const minimumPassRate = Number(assistantEvaluation.minimumPassRate || 0.95);
    const report = {
        version: assistantEvaluation.version,
        generatedAt: new Date().toISOString(),
        total: results.length,
        passed,
        failed,
        passRate,
        minimumPassRate,
        criticalFailures,
        cases: results
    };
    const reportDirectory = path.join(root, 'test-results');
    fs.mkdirSync(reportDirectory, { recursive: true });
    fs.writeFileSync(path.join(reportDirectory, 'assistant-evaluation.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) {
        const failedRows = results.filter(result => !result.passed)
            .map(result => `| ${result.id} | ${result.critical ? 'critical' : 'regular'} | ${result.failures.join('<br>')} |`)
            .join('\n');
        const summary = [
            '## Assistant evaluation gate',
            '',
            `- Result: **${passed}/${results.length} passed (${(passRate * 100).toFixed(1)}%)**`,
            `- Required: **${(minimumPassRate * 100).toFixed(1)}%**`,
            `- Critical failures: **${criticalFailures.length}**`,
            '',
            failedRows ? '| Case | Severity | Failure |\n| --- | --- | --- |\n' + failedRows : 'All evaluation cases passed.'
        ].join('\n');
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    }
    assert.equal(assistantEvaluation.version, 2);
    assert.ok(assistantEvaluation.cases.length >= 50, 'the fixed evaluation set should cover at least 50 scenarios');
    assert.deepEqual(criticalFailures, [], `critical assistant evaluation cases failed: ${criticalFailures.join(', ')}`);
    assert.ok(passRate >= minimumPassRate, `assistant evaluation pass rate ${(passRate * 100).toFixed(1)}% is below ${(minimumPassRate * 100).toFixed(1)}%:\n${results.filter(result => !result.passed).map(result => `${result.id}: ${result.failures.join('; ')}`).join('\n')}`);
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

test('the local knowledge center explains privacy, read-only behavior and role scope', () => {
    const { api } = createHarness();
    const knowledge = api.answerAssistantQuery('مين يقدر يشوف البيانات؟', NOW);
    assert.equal(knowledge.id, 'knowledge');
    assert.match(knowledge.html, /محليًا/);
    assert.match(knowledge.html, /قراءة فقط/);
    assert.match(knowledge.html, /صلاحيات المدير/);

    const owner = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    const ownerKnowledge = owner.api.answerAssistantQuery('إزاي أستخدم عم عبده؟', NOW);
    assert.equal(ownerKnowledge.id, 'knowledge');
    assert.match(ownerKnowledge.html, /بيانات الشقق الأخرى/);
    assert.doesNotMatch(ownerKnowledge.html, /رصيد الخزنة|إجمالي تحصيل/);
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
    assert.match(reports.html, /اطلب التقرير بصيغة طبيعية/);
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

    assert.doesNotMatch(assistantSource, /ASSISTANT_SUGGESTIONS/);
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

test('the doorman remembers the discussed period and reuses it for follow-ups', () => {
    const { api } = createHarness();
    assert.equal(api.hasAssistantTimeHint('تحصيل أكتوبر 2026'), true);
    assert.equal(api.hasAssistantTimeHint('ومصروفات؟'), false);

    const october = api.answerAssistantQuery('تحصيل أكتوبر 2026', NOW);
    assert.equal(october.id, 'income');

    const followUp = api.answerAssistantQuery('ومصروفات؟', NOW);
    assert.equal(followUp.id, 'expenses');
    assert.match(followUp.title, /أكتوبر 2026/, 'the follow-up stays in the month already on screen');
    assert.match(followUp.html, /صيانة أسانسير/);

    const explicit = api.answerAssistantQuery('مصروفات الشهر', NOW);
    assert.match(explicit.title, /نوفمبر 2026/, 'an explicit month still wins over memory');
});

test('follow-up suggestions remain available as response metadata without rendering clickable chips', () => {
    const { api } = createHarness();
    const answer = api.answerAssistantQuery('ملخص أكتوبر 2026', NOW);
    assert.deepEqual(Array.from(answer.followUps, item => item.query), ['مصروفات أكتوبر 2026', 'مين عليه متأخرات؟', 'رصيد الخزنة كام؟']);
    assert.doesNotMatch(answer.html, /class="assistant-followups"/);
    assert.doesNotMatch(answer.html, /data-assistant-query=/);

    const unscoped = api.buildAssistantFollowUps('income', { type: 'year', label: 'سنة 2026', months: [] });
    assert.equal(unscoped[0].query, 'مصروفات الشهر', 'a year period has no single month to name');
    unscoped.forEach(item => assert.ok(item.label && item.query));
});

test('a pronoun after a unit question keeps talking about the same resident', () => {
    const { api } = createHarness();
    assert.equal(api.answerAssistantQuery('شقة 7 دفع كام؟', NOW).id, 'resident');

    const followUp = api.answerAssistantQuery('هو دفع كام؟', NOW);
    assert.equal(followUp.id, 'resident');
    assert.match(followUp.title, /سارة حسن/);

    assert.equal(api.assistantFollowsResident('هو متأخر من قد إيه؟'), true);
    assert.equal(api.assistantFollowsResident('مين عليه متأخرات؟'), false);
});

test('the chat and its context survive a reopen and reset wipes both', () => {
    const { context, api, storage } = createHarness();
    api.appendAssistantMessage('user', '<p>سؤال</p>');
    api.answerAssistantQuery('تحصيل أكتوبر 2026', NOW);
    assert.equal(JSON.parse(storage.getItem('manzil-assistant-chat:building-1:manager')).length, 1);
    assert.match(storage.getItem('manzil-assistant-context:building-1:manager'), /أكتوبر 2026/);

    vm.runInContext('assistantChat = []; assistantContext = { period: null, residentId: null };', context);
    api.restoreAssistantSession();
    assert.equal(api.chatSnapshot().length, 1);
    assert.equal(api.contextSnapshot().period.label, 'أكتوبر 2026');
    assert.match(api.answerAssistantQuery('ومصروفات؟', NOW).title, /أكتوبر 2026/);

    vm.runInContext(`
        assistantChat = [];
        assistantContext = { period: null, residentId: null };
        resetAssistantChat();
    `, context);
    assert.equal(JSON.parse(storage.getItem('manzil-assistant-context:building-1:manager')).period, null);
    assert.equal(api.chatSnapshot().length, 1, 'reset leaves only the fresh greeting');
});

test('starting a new chat clears remote history before later messages are appended', async () => {
    const events = [];
    let releaseClear;
    const clearGate = new Promise(resolve => { releaseClear = resolve; });
    const { context, api } = createHarness(true, {}, {
        instrument: sandbox => {
            sandbox.window = sandbox;
            sandbox.manzilAssistantChatStore = {
                clear: async () => { events.push('clear-start'); await clearGate; events.push('clear-done'); return true; },
                append: async (_sender, body) => { events.push(`append:${body}`); }
            };
        }
    });
    vm.runInContext('assistantRemoteHydrated = true', context);
    api.resetAssistantChat();
    api.appendAssistantMessage('user', '<p>سؤال جديد</p>', 'سؤال جديد');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['clear-start'], 'new messages wait behind the durable clear marker');
    releaseClear();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['clear-start', 'clear-done', 'append:سؤال جديد']);
    assert.equal(api.chatSnapshot().length, 2, 'the local chat contains only its greeting and the new message');
});

test('a tampered chat log is dropped instead of rendered', () => {
    const { api, storage } = createHarness();
    storage.setItem('manzil-assistant-chat:building-1:manager', JSON.stringify([
        { role: 'bot', html: '<img src=x onerror="alert(1)">' },
        { role: 'bot', html: '<script>alert(1)</script>' },
        { role: 'bot', html: '<p class="assistant-hello">رد سليم</p>' }
    ]));
    api.restoreAssistantSession();
    assert.equal(api.chatSnapshot().length, 1);
    assert.match(api.chatSnapshot()[0].html, /رد سليم/);
});

test('the assistant calls each signed-in user by their own name', () => {
    const named = createHarness(true, { role: 'manager', profileName: 'محمود سمير' });
    assert.equal(named.api.assistantUserDisplayName(), 'محمود سمير');
    assert.match(named.api.buildAssistantGreetingHtml(NOW), /أهلاً يا محمود سمير/);
    assert.match(named.api.answerAssistantQuery('شكرا', NOW).html, /تحت أمرك يا محمود سمير/);

    const owner = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    assert.match(owner.api.buildAssistantGreetingHtml(NOW), /أهلاً يا أحمد علي/);

    const anonymous = createHarness(true, { role: 'manager', profileName: null });
    assert.equal(anonymous.api.assistantAddress(), 'يا أستاذ', 'an unnamed account keeps the generic address');
});

test('an owner bill answer covers their own apartment and their own due window', () => {
    const { api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    const bill = api.answerAssistantQuery('عليّا كام في أكتوبر 2026؟', NOW);
    assert.equal(bill.id, 'my_bill');
    assert.match(bill.title, /أكتوبر 2026/);
    assert.match(bill.html, /شقة 3/);
    assert.match(bill.html, /يوم 5 من كل شهر/);
    assert.match(bill.html, /فترة السماح/);
    assert.doesNotMatch(bill.html, /سارة/, 'an owner never sees another resident');

    const followUp = api.answerAssistantQuery('عليّا كام؟', NOW);
    assert.match(followUp.title, /أكتوبر 2026/, 'the month just discussed carries over');
    const fresh = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    assert.match(fresh.api.answerAssistantQuery('عليّا كام؟', NOW).title, /نوفمبر 2026/);
    assert.equal(api.detectOwnerAssistantIntent(api.normalizeAssistantArabic('مين عليه متأخرات')), 'owner_scope', 'a third-person arrears question is management-only');
    assert.equal(fresh.api.answerAssistantQuery('مين عليه متأخرات؟', NOW).id, 'owner_scope');
});

test('the owner assistant never guesses another apartment when the identity is missing', () => {
    const { api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'missing' });
    const bill = api.answerAssistantQuery('عليّا كام؟', NOW);
    assert.equal(bill.id, 'owner_scope');
    assert.match(bill.html, /مفيش شقة/);
    assert.doesNotMatch(bill.html, /أحمد|سارة|شقة 3|شقة 7/, 'an unmatched owner identity must never fall back to another unit');
});

test('an owner assistant reads only the apartment bound to its resident id', () => {
    const { context, api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r2' });
    vm.runInContext(`state.residents = ${JSON.stringify(RESIDENTS)};`, context);
    const bill = api.answerAssistantQuery('عليّا كام؟', NOW);
    assert.equal(bill.id, 'my_bill');
    assert.match(bill.html, /شقة 7/);
    assert.doesNotMatch(bill.html, /أحمد|شقة 3/, 'even with a wider resident read the owner stays on their own unit');
});

test('owners cannot request the manager executive summary', () => {
    const owner = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    const answer = owner.api.answerAssistantQuery('ملخص تنفيذي نوفمبر 2026', NOW);
    assert.equal(answer.id, 'owner_scope');
    assert.doesNotMatch(answer.html, /إجمالي السيولة|إجمالي المتأخرات/);
});
test('building-wide questions are refused for owners instead of answered with their slice', () => {
    const { api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    for (const query of ['إجمالي تحصيل العمارة', 'مصروفات الشهر', 'رصيد الخزنة كام؟', 'تقرير المالك', 'عدد السكان']) {
        const answer = api.answerAssistantQuery(query, NOW);
        assert.equal(answer.id, 'owner_scope', query);
        assert.match(answer.html, /دي تخص إدارة العمارة|بتظهر في حسابك/);
        assert.doesNotMatch(answer.html, /1,200|390|200\.00/, 'no building aggregate leaks into the refusal');
    }
    const adjustments = api.answerAssistantQuery('الإعفاءات والتخفيضات', NOW);
    assert.equal(adjustments.id, 'my_adjustments');
    assert.doesNotMatch(adjustments.html, /سارة|خصم أخوة/);
});

test('owners get receipts, due dates, payment methods, notices, notifications and the manager', () => {
    const { api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    assert.equal(api.answerAssistantQuery('إيصالاتي', NOW).id, 'my_receipts');
    assert.doesNotMatch(api.answerAssistantQuery('إيصالاتي', NOW).html, /سارة|200\.00/, 'only their own payments');
    assert.equal(api.answerAssistantQuery('آخر يوم للدفع كام؟', NOW).id, 'my_due_date');
    assert.equal(api.answerAssistantQuery('أقدر أدفع بإيه؟', NOW).id, 'payment_methods');
    const methods = api.answerAssistantQuery('طرق الدفع المتاحة', NOW).html;
    assert.match(methods, /تحويل بنكي/);
    assert.match(methods, /InstaPay/);
    assert.doesNotMatch(methods, /فودافون كاش/, 'a disabled method must not be offered');
    assert.equal(api.answerAssistantQuery('إعلانات المبنى', NOW).id, 'notices');
    assert.match(api.answerAssistantQuery('إعلانات المبنى', NOW).html, /قراءة العدادات/);
    assert.equal(api.answerAssistantQuery('إشعاراتي', NOW).id, 'my_notifications');
    assert.match(api.answerAssistantQuery('إشعاراتي', NOW).html, /إيصال جديد/);
    assert.equal(api.answerAssistantQuery('رقم المدير', NOW).id, 'contact');
    assert.match(api.answerAssistantQuery('رقم المدير', NOW).html, /href="tel:01000000000"/);
    assert.equal(api.answerAssistantQuery('بيانات شقتي', NOW).id, 'my_apartment');
});

test('an owner greeting and follow-ups stay inside their own scope', () => {
    const { api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    const greeting = api.answerAssistantQuery('السلام عليكم', NOW);
    assert.equal(greeting.id, 'greeting');
    assert.match(greeting.html, /شقة 3/);
    assert.doesNotMatch(greeting.html, /1,200/, 'the owner greeting never shows cashbox balances');
    const labels = Array.from(api.buildAssistantFollowUps('my_bill', { type: 'month', label: 'نوفمبر 2026', months: ['نوفمبر 2026'] })
        .map(item => item.query));
    assert.deepEqual(labels, ['إيصالاتي', 'آخر يوم للدفع كام؟', 'عليّا متأخرات؟']);
    assert.equal(api.buildAssistantFollowUps('summary', { type: 'month', label: 'نوفمبر 2026', months: ['نوفمبر 2026'] }).length, 2, 'unknown ids fall back to owner suggestions');
});

test('assistant history is stored per identity so an owner never restores the manager chat', () => {
    const { context, api, storage } = createHarness();
    api.appendAssistantMessage('bot', '<p>رصيد الخزنة 1,200</p>');
    assert.ok(storage.map.has('manzil-assistant-chat:building-1:manager'));
    vm.runInContext(`
        currentUserRole = 'owner';
        currentResidentId = 'r1';
        assistantChat = [];
        assistantContext = { period: null, residentId: null };
    `, context);
    api.restoreAssistantSession();
    assert.equal(api.chatSnapshot().length, 0, 'the owner session starts clean');
    assert.ok(!storage.map.has('manzil-assistant-chat:building-1:owner-r1'));
});

test('owners keep the launcher and can open the assistant without manager rights', () => {
    assert.match(assistantSource, /function isAssistantFabAllowed\(\) \{[\s\S]{0,220}currentUserRole !== 'manager' && currentUserRole !== 'owner'/);
    assert.match(assistantSource, /function openAssistantModal\(\) \{[\s\S]{0,240}currentUserRole !== 'manager' && currentUserRole !== 'owner'/);
    assert.doesNotMatch(assistantSource, /function openAssistantModal\(\) \{[\s\S]{0,80}requireManager/, 'the assistant is no longer manager-only');
    assert.doesNotMatch(css, /body\.owner-mode \.assistant-fab\s*[,{][^}]*display:\s*none/, 'the launcher must stay visible in the owner portal');
    assert.match(css, /body\.owner-mode \.assistant-fab \{ bottom:/, 'and sit lower while the bottom nav is hidden');
    assert.doesNotMatch(assistantSource, /ASSISTANT_SUGGESTIONS/);
    assert.match(assistantSource, /const map = assistantIsOwner\(\) \? ASSISTANT_FOLLOWUPS_OWNER : ASSISTANT_FOLLOWUPS;/);
    assert.match(supabaseSource, /\.select\('must_change_pin,theme_preference,full_name'\)/, 'the display name rides in with the profile');
    assert.match(supabaseSource, /currentProfileName = typeof profile\?\.full_name/);
    assert.match(supabaseSource, /if \(typeof syncAssistantFab === 'function'\) syncAssistantFab\(\)/, 'the launcher syncs once the session is known');
    assert.match(stateSource, /var currentProfileName = null;/);
    assert.match(appSource, /if \(id !== 'pinLockModal' && !OWNER_ALLOWED_MODALS\.has\(id\) && !requireManager\(\)\) return;/);
    assert.match(appSource, /const OWNER_ALLOWED_MODALS = new Set\(\['assistantModal'\]\);/, 'owners may open only the assistant and its speech-download dialog');
});

test('owner notices and notifications never surface the manager feed', () => {
    const { context, api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    vm.runInContext(`
        state.managerNotifications = [
            { id: 'mn1', title: 'سرّي للمدير', body: 'تفاصيل داخلية للمدير فقط', createdAt: '2026-11-13T08:00:00.000Z' }
        ];
    `, context);

    const notices = api.buildAssistantNoticesAnswer();
    assert.equal(notices.id, 'notices');
    assert.match(notices.html, /قراءة العدادات/, 'owners still get the building-wide announcements');
    assert.doesNotMatch(notices.html, /سرّي للمدير/, 'the manager feed never leaks into the owner notices tool');

    const notifications = api.buildAssistantOwnerNotificationsAnswer();
    assert.equal(notifications.id, 'my_notifications');
    assert.match(notifications.html, /إيصال جديد/);
    assert.doesNotMatch(notifications.html, /سرّي للمدير/, 'the owner notifications tool reads only the account-scoped store');
});

test('a manager never reads the owner notification store through the assistant', () => {
    const { context, api } = createHarness(true, { role: 'manager', profileName: 'أ. محمد' });
    vm.runInContext(`
        state.ownerNotifications = [
            { id: 'on9', title: 'إيصال جديد لأحمد', body: 'تم تسجيل دفعة نوفمبر', createdAt: '2026-11-04T08:00:00.000Z' }
        ];
    `, context);

    for (const query of ['إشعاراتي', 'ملخص الشهر', 'التحصيل', 'رصيد الخزنة كام؟', 'إعلانات المبنى', 'بيانات العمارة']) {
        const answer = api.answerAssistantQuery(query, NOW);
        assert.doesNotMatch(answer.html, /إيصال جديد لأحمد/, `${query} must never read the owner feed`);
    }
    assert.equal(api.detectAssistantIntent(api.normalizeAssistantArabic('إشعاراتي'), false), 'unknown', 'managers have no owner-notifications read tool');
});

test('owner and manager notification reads stay split at the source', () => {
    assert.match(supabaseSource, /currentUserRole === 'owner'[\s\S]{0,160}\.eq\('target_user_id', session\.user\.id\)/, 'owners load only their own notifications');
    assert.match(supabaseSource, /currentUserRole === 'manager'[\s\S]{0,180}\.is\('target_user_id', null\)/, 'managers load only the building-wide feed');
    assert.match(supabaseSource, /ownerNotifications: currentUserRole === 'owner'/, 'the owner store is filled for owners only');
    assert.match(supabaseSource, /managerNotifications: currentUserRole === 'manager'/);
    assert.match(assistantSource, /function buildAssistantNoticesAnswer\([\s\S]{0,240}state\.notices/, 'the notices tool reads the shared announcements list');
    assert.match(assistantSource, /function buildAssistantOwnerNotificationsAnswer\([\s\S]{0,240}state\.ownerNotifications/, 'the owner notifications tool reads the account-scoped store');
    assert.doesNotMatch(assistantSource, /state\.managerNotifications/, 'the two notification stores never mix inside the assistant');
});

test('assistant understands the full app guide and operational support sections', () => {
    const { api } = createHarness(true, { role: 'manager', profileName: 'أ. محمد' });
    const guide = api.answerAssistantQuery('وريني كل أقسام التطبيق', NOW);
    assert.equal(guide.id, 'app_guide');
    assert.match(guide.html, /النسخ الاحتياطي/);
    assert.match(guide.html, /المستأجر/);
    const settings = api.answerAssistantQuery('إعدادات ميعاد الاستحقاق وطرق الدفع', NOW);
    assert.equal(settings.id, 'settings');
    assert.match(settings.html, /فترة السماح/);
    const backup = api.answerAssistantQuery('إزاي أعمل باك اب؟', NOW);
    assert.equal(backup.id, 'backup');
    assert.match(backup.html, /لا ينشئ نسخة/);
});

test('assistant resolves colloquial previous-year and all-period requests', () => {
    const { api } = createHarness(true, { role: 'manager' });
    const previousYear = api.answerAssistantQuery('تحصيل السنة اللي فاتت', NOW);
    assert.equal(previousYear.id, 'income');
    assert.match(previousYear.title, /سنة 2025/);
    const allPeriods = api.answerAssistantQuery('إجمالي عام للمصروفات', NOW);
    assert.equal(allPeriods.id, 'expenses');
    assert.match(allPeriods.title, /كل الفترات/);
});

test('owner questions about manager settings and backups remain scoped', () => {
    const { api } = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    for (const query of ['إعدادات العمارة', 'النسخة الاحتياطية', 'سجل التدقيق']) {
        assert.equal(api.answerAssistantQuery(query, NOW).id, 'owner_scope', query);
    }
});

// Feature-branch audit and mutation regression coverage retained during the merge.

test('assistant answers stay read-only until the manager confirms in an official form', () => {
    // Producing an answer or draft must leave `state` untouched. Mutations remain
    // in the existing manager forms and are never written directly by the chat.
    const snapshotState = context => JSON.stringify(vm.runInContext('state', context));

    const manager = createHarness(true);
    const managerBefore = snapshotState(manager.context);
    const managerQueries = [
        'ملخص أكتوبر 2026', 'ملخص نوفمبر 2026', 'مين عليه متأخرات؟', 'رصيد الخزنة كام؟',
        'تحصيل الشهر', 'مصروفات الشهر', 'الإعفاءات والتخفيضات', 'بيانات العمارة', 'آخر الحركات',
        'سجّل دفعة لأحمد', 'أضف مصروف كهرباء', 'احذف مصروف النظافة', 'اعمل إيصال لأحمد', 'عدّل مصروف'
    ];
    for (const query of managerQueries) {
        const answer = manager.api.answerAssistantQuery(query, NOW);
        assert.ok(answer && typeof answer.html === 'string', `"${query}" is answered without throwing`);
    }
    assert.equal(snapshotState(manager.context), managerBefore, 'answering never mutates application state');

    const owner = createHarness(true, { role: 'owner', ownerScoped: true, residentId: 'r1' });
    const ownerBefore = snapshotState(owner.context);
    for (const query of ['عليّا كام الشهر ده؟', 'إيصالاتي', 'إعلانات المبنى', 'إشعاراتي', 'رقم المدير', 'سجّل دفعة', 'احذف مصروف']) {
        owner.api.answerAssistantQuery(query, NOW);
    }
    assert.equal(snapshotState(owner.context), ownerBefore, 'owner answers are read-only too');

    // Source-level: the assistant owns no write primitive at all.
    assert.doesNotMatch(assistantSource, /\bstate\s*(?:\.\s*[\w$]+|\[[^\]]+\])\s*=(?!=)/, 'the assistant never assigns into `state`');
    assert.doesNotMatch(assistantSource, /supabaseClient|\.rpc\(|\.from\(\s*['"][^'"]*['"]\s*\)[\s\S]{0,40}\.(?:insert|update|upsert|delete)\b/, 'no database write path is reachable');
    assert.doesNotMatch(assistantSource, /\b(?:addIncome|addExpense|saveState|persistState|deleteResident|deleteIncome|deleteExpense)\s*\(/, 'no mutation helpers are wired into the assistant');
});
test('assistant operations use one explicit form confirmation and add request-linked audit details', () => {
    const { context, api } = createHarness(true);
    const command = 'سجّل تحصيل 500 جنيه من سارة حسن شقة 7 عن نوفمبر 2026 نقدي في الخزنة الرئيسية';
    const before = JSON.stringify(vm.runInContext('state', context));
    assert.equal(api.answerAssistantQuery(command, NOW).id, 'operation-preview');
    assert.equal(JSON.stringify(vm.runInContext('state', context)), before, 'preview does not mutate app state');

    vm.runInContext('toast = () => {}', context);
    vm.runInContext('globalThis.openAssistantIncomeDraft = () => true', context);
    assert.equal(api.openAssistantOperation(), true, 'the preview opens the existing income form');
    const requestId = api.assistantOperationRequestId('income');
    assert.equal(requestId, 'test-id');
    assert.equal(api.requireAssistantOperationReadyForCommit('income'), true);
    assert.equal(api.beginAssistantOperationCommit('income'), requestId, 'the official form becomes the single final confirmation point');
    assert.equal(api.beginAssistantOperationCommit('income'), false, 'a second click while saving is blocked');

    api.logAction('تحصيل اشتراك', 'سارة حسن - 500 ج.م');
    const audit = vm.runInContext('state.auditLogs[0].details', context);
    assert.match(audit, /المصدر: عم عبده/);
    assert.match(audit, /مرجع الطلب: test-id/);
    assert.match(audit, /طلب المدير: سجّل تحصيل 500 جنيه من سارة حسن شقة 7 عن نوفمبر 2026/);

    assert.equal(api.completeAssistantOperation(requestId), true, 'a confirmed save clears its assistant context');
    api.logAction('مصروف', 'كهرباء - 50 ج.م');
    assert.equal(vm.runInContext('state.auditLogs[0].details', context), 'كهرباء - 50 ج.م', 'ordinary operations are not mislabeled as assistant work');
});
test('an ambiguous assistant save remains locked after closing the form until the manager refreshes', () => {
    const { context, api } = createHarness(true);
    vm.runInContext('toast = () => {}', context);
    api.answerAssistantQuery('أضف مصروف كهرباء 800 جنيه عن نوفمبر 2026', NOW);
    vm.runInContext('globalThis.openAssistantExpenseDraft = () => true', context);
    assert.equal(api.openAssistantOperation(), true);
    const requestId = api.assistantOperationRequestId('expense');
    assert.equal(api.beginAssistantOperationCommit('expense'), requestId);
    api.markAssistantOperationSaveUncertain(requestId);
    assert.equal(api.requireAssistantOperationReadyForCommit('expense'), false);
    api.clearAssistantOperationContext();
    assert.equal(api.assistantOperationRequestId('expense'), requestId, 'closing the form does not discard an unresolved idempotency key');
    assert.equal(api.answerAssistantQuery('سجّل تحصيل 100 جنيه من أحمد شقة 3', NOW).id, 'operation-pending');
});
test('all assistant-origin financial forms share the same request-id commit and audit path', () => {
    for (const type of ['income', 'expense', 'adjustment']) {
        assert.match(crudSource, new RegExp(`crudBeginAssistantOperationCommit\\('${type}'\\)`), `${type} has the unified confirmation guard`);
        assert.match(crudSource, /saveWithRollback\(previousState, assistantRequestId\)/, `${type} uses atomic request-id persistence`);
        assert.match(crudSource, /markAssistantOperationSaveUncertain\(assistantRequestId\)/, `${type} locks ambiguous retries`);
    }
    assert.match(crudSource, /crudAssistantOperationReady\('adjustment'\)[\s\S]*?crudAssistantOperationReady\('income'\)[\s\S]*?crudAssistantOperationReady\('expense'\)/, 'all three forms use the shared assistant confirmation gate');
    assert.match(stateSource, /assistantAuditDetails\(details\)/, 'the shared audit logger adds request source metadata');
    assert.match(appSource, /clearAssistantOperationContext\(\)/, 'closing the official form cleans up or retains the correct context');
    assert.match(appSource, /function closeModal\(id\)[\s\S]{0,200}'residentModal'[\s\S]{0,120}clearAssistantOperationContext/, 'closing the resident form also clears or retains its assistant context safely');
    assert.match(supabaseSource, /p_request_id:\s*requestId/, 'the stable id reaches the existing atomic Supabase RPC');
});
test('assistant edits and deletions use manager gates, record-specific confirmation and audit ids', () => {
    for (const [name, type] of [['deleteResident', 'resident_delete'], ['deleteIncome', 'income_delete'], ['deleteExpense', 'expense_delete'], ['deleteAdjustment', 'adjustment_delete']]) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const body = crudSource.match(new RegExp(`async function ${escaped}\\(id, requestId = null\\) \\{([\\s\\S]*?)\\n\\}`, 'm'))?.[1];
        assert.ok(body, `${name} accepts only the targeted optional assistant request id`);
        assert.match(body, new RegExp(`crudBeginAssistantDelete\\('${type}', requestId\\)`));
        assert.match(body, /assistantAuditDetails|crudAssistantAuditDetails/);
        assert.match(body, /saveWithRollback\(previousState, assistantRequestId\)/);
        assert.match(body, /markAssistantOperationSaveUncertain\(assistantRequestId\)/);
    }
    assert.match(crudSource, /async function handleResidentSubmit\(e\)[\s\S]*?crudAssistantOperationReady\('resident'\)[\s\S]*?saveWithRollback\(previousState, assistantRequestId\)/);
    assert.match(crudSource, /async function handleIncomeEditSubmit\(event\)[\s\S]*?crudAssistantOperationReady\('income'\)[\s\S]*?saveWithRollback\(previousState, assistantRequestId\)/);
});
test('compound manager questions combine collection and expenses for the requested period', () => {
    const { api } = createHarness();
    const answer = api.answerAssistantQuery('التحصيلات والمصروفات والمتأخرات في نوفمبر 2026', NOW);
    assert.equal(answer.id, 'compound');
    assert.match(answer.html, /نوفمبر 2026/);
    assert.match(answer.html, /التحصيل/);
    assert.match(answer.html, /المصروفات/);
    assert.match(answer.html, /المتأخرات/);
});
test('owner queries mentioning multiple manager metrics stay inside the owner scope', () => {
    const { api } = createHarness(true, { role: 'owner', residentId: 'r1', ownerScoped: true });
    const answer = api.answerAssistantQuery('التحصيلات والمصروفات والمتأخرات في نوفمبر 2026', NOW);
    assert.equal(answer.id, 'owner_scope');
    assert.doesNotMatch(answer.html, /إجمالي السيولة|المتأخرات المتراكمة/);
});
test('assistant mutation resolver requires an exact single match and does not treat apartment number as amount', () => {
    const { api } = createHarness();
    const ambiguous = api.parseAssistantMutationCommand('احذف تحصيل أحمد شقة 3 نوفمبر 2026', NOW);
    assert.match(ambiguous.error, /2 سجلات مطابقة/);
    const exact = api.parseAssistantMutationCommand('احذف تحصيل أحمد شقة 3 بمبلغ 40 جنيه نوفمبر 2026', NOW);
    assert.equal(exact.id, 'i3');
    assert.equal(exact.type, 'income');
});
test('assistant mutation resolver identifies a unique expense in the requested month', () => {
    const { api } = createHarness();
    const result = api.parseAssistantMutationCommand('عدل مصروف نوفمبر 2026 بمبلغ 60 جنيه إلى 75 جنيه', NOW);
    assert.equal(result.id, 'e1', 'the old amount identifies the exact stored row');
    assert.equal(result.type, 'expense');
    assert.equal(result.action, 'edit');
    assert.equal(result.requestedAmount, 75, 'the requested new amount is only staged for the official form');
});
test('assistant refuses to save a stale edit if the selected row changes after preview', () => {
    const { api, context } = createHarness();
    const expectedRecord = vm.runInContext('JSON.stringify(state.expenses.find(item => item.id === "e1"))', context);
    context.toast = () => {};
    api.startAssistantOperationContext({
        id: 'e1', type: 'expense', action: 'edit', mode: 'edit', requestId: 'req-edit-1',
        expectedRecord, raw: 'عدل مصروف نوفمبر'
    });
    vm.runInContext('state.expenses.find(item => item.id === "e1").amount = 61', context);
    assert.equal(api.requireAssistantOperationReadyForCommit('expense'), false);
    assert.equal(api.assistantOperationStatus(), 'uncertain');
});
test('assistant deletion preview is read-only and can be cancelled without touching state', () => {
    const { api, context } = createHarness();
    const before = vm.runInContext('JSON.stringify(state.expenses)', context);
    const mutation = api.parseAssistantMutationCommand('احذف مصروف نوفمبر 2026 بمبلغ 60 جنيه', NOW);
    const preview = api.buildAssistantMutationPreview(mutation);
    assert.equal(preview.id, 'mutation-delete-preview');
    assert.match(preview.html, /تأكيد الحذف/);
    assert.equal(vm.runInContext('JSON.stringify(state.expenses)', context), before);
    assert.ok(api.mutationDraftSnapshot());
    context.toast = () => {};
    api.cancelAssistantMutation();
    assert.equal(api.mutationDraftSnapshot(), null);
    assert.equal(vm.runInContext('JSON.stringify(state.expenses)', context), before);
});
test('assistant cannot delete a resident with linked payments and owners never receive mutation previews', () => {
    const manager = createHarness();
    const blocked = manager.api.parseAssistantMutationCommand('احذف الشقة أحمد شقة 3', NOW);
    assert.match(blocked.error, /لا يمكن حذف شقة/);
    const owner = createHarness(true, { role: 'owner', residentId: 'r1', ownerScoped: true });
    const answer = owner.api.answerAssistantQuery('احذف تحصيل أحمد شقة 3 نوفمبر 2026', NOW);
    assert.notEqual(answer.id, 'mutation-delete-preview');
    assert.notEqual(answer.id, 'mutation-edit-preview');
});
test('assistant prepares new apartment and tenant details in a read-only preview', () => {
    const { api, context } = createHarness();
    const before = vm.runInContext('JSON.stringify(state.residents)', context);
    const entry = api.parseAssistantResidentEntryCommand('أضف شقة جديدة باسم عمر سالم، شقة 8، الدور 2، اشتراك 120 جنيه، مؤجرة، اسم المستأجر يوسف', NOW);
    assert.equal(entry.name, 'عمر سالم');
    assert.equal(entry.apartmentNumber, '8');
    assert.equal(entry.floor, '2');
    assert.equal(entry.tenantName, 'يوسف');
    const preview = api.buildAssistantResidentEntryPreview(entry);
    assert.equal(preview.id, 'resident-entry-preview');
    assert.match(preview.html, /المستأجر: يوسف/);
    assert.equal(vm.runInContext('JSON.stringify(state.residents)', context), before);
    context.toast = () => {};
    api.cancelAssistantResidentEntry();
    assert.equal(api.residentEntryDraftSnapshot(), null);
    assert.equal(vm.runInContext('JSON.stringify(state.residents)', context), before);
    const answer = api.answerAssistantQuery('أضف شقة جديدة باسم عمر سالم، شقة 8، الدور 2، اشتراك 120 جنيه، مؤجرة، اسم المستأجر يوسف', NOW);
    assert.equal(answer.id, 'resident-entry-preview');
});
test('assistant apartment entry rejects duplicates and invalid floor mapping before opening the form', () => {
    const { api } = createHarness();
    const duplicate = api.parseAssistantResidentEntryCommand('أضف شقة جديدة باسم أحمد، شقة 3، الدور 1', NOW);
    assert.match(duplicate.error, /مسجلة بالفعل/);
    const wrongFloor = api.parseAssistantResidentEntryCommand('أضف شقة جديدة باسم عمر، شقة 8، الدور 1', NOW);
    assert.match(wrongFloor.error, /لا يطابق الدور/);
});
test('follow-up suggestions keep the discussed month without rendering clickable chips', () => {
    const { api } = createHarness();
    const answer = api.answerAssistantQuery('ملخص أكتوبر 2026', NOW);
    assert.deepEqual(Array.from(answer.followUps, item => item.query), ['مصروفات أكتوبر 2026', 'مين عليه متأخرات؟', 'رصيد الخزنة كام؟']);
    assert.doesNotMatch(answer.html, /class="assistant-followups"/);
    assert.doesNotMatch(answer.html, /data-assistant-query=/);

    const unscoped = api.buildAssistantFollowUps('income', { type: 'year', label: 'سنة 2026', months: [] });
    assert.equal(unscoped[0].query, 'مصروفات الشهر', 'a year period has no single month to name');
    unscoped.forEach(item => assert.ok(item.label && item.query));
});
