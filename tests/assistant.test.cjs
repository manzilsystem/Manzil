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
        assistantAddress,
        assistantUserDisplayName,
        detectOwnerAssistantIntent,
        detectAssistantIntent,
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
        assistantEscape,
        buildAssistantFollowUps,
        hasAssistantTimeHint,
        assistantFollowsResident,
        resolveAssistantPeriodWithContext,
        restoreAssistantSession,
        appendAssistantMessage,
        chatSnapshot: () => assistantChat,
        contextSnapshot: () => assistantContext,
        ASSISTANT_NAME,
        ASSISTANT_SUGGESTIONS
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
    assert.match(html, /id="assistantLog"[^>]*onclick="handleAssistantSuggestion\(event\)"/, 'follow-up chips inside the log reuse the delegated handler');
    assert.match(html, /id="assistantInput"[^>]*maxlength="240"/);
    assert.match(html, /id="assistantSuggestions"[^>]*onclick="handleAssistantSuggestion\(event\)"/);
    assert.match(html, /onsubmit="sendAssistantMessage\(event\)"/);
    assert.match(html, /<button type="button" id="assistantFab"[^>]*onclick="openAssistantModal\(\)"/);
    assert.match(html, /aria-label="اسأل عم عبده البواب"/);
    assert.match(html, /class="assistant-avatar-frame assistant-fab-avatar"><img src="icons\/assistant-abbah-full\.png\?v=/, 'the launcher shows the full-body doorman');
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
    assert.match(css, /\.assistant-fab\.is-talking \.assistant-fab-avatar img \{[\s\S]*assistant-fab-talk/, 'talking shakes the doorman');
    assert.match(css, /@keyframes assistant-fab-talk/);
    assert.match(assistantSource, /applyAssistantFabState\(false, assistantFabCompactByScroll\)/, 'scroll state only compacts the launcher');
    assert.doesNotMatch(assistantSource, /assistantFabHiddenByScroll/, 'scrolling must never hide the launcher again');
    assert.match(css, /body\.owner-mode \.assistant-fab/);
    assert.match(css, /@media print \{ \.assistant-fab \{ display: none !important; \} \}/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.assistant-fab/);
    assert.match(css, /\.assistant-avatar img \{[\s\S]*transform: scale\(1\.7\);[\s\S]*transform-origin: 50% 28%;/, 'the modal head uses the same framing as the launcher');
    assert.match(css, /\.assistant-hero \{/);
    assert.match(assistantSource, /icons\/assistant-abbah-full\.png/, 'the greeting shows the full-body avatar');
    assert.match(html, /id="assistantSoundButton"[^>]*onclick="toggleAssistantSound\(\)"/, 'the head carries a mute toggle for the doorman voice');
    assert.match(assistantSource, /ASSISTANT_SPEECH_LANG = 'ar-EG'/, 'the doorman speaks Egyptian Arabic');
    assert.match(assistantSource, /ASSISTANT_SPEECH_PITCH = 0\.8/, 'the voice is pitched like a grand doorman');
    assert.match(assistantSource, /ASSISTANT_SPEECH_RATE = 0\.95/, 'the voice is slowed for gravitas');
    assert.match(assistantSource, /window\.SpeechSynthesisUtterance\(phrase\)/, 'the doorman uses the on-device speech engine');
    assert.match(assistantSource, /utterance\.onstart = \(\) => setAssistantTalking\(true\)/, 'talking starts when the voice starts');
    assert.match(assistantSource, /utterance\.onend = \(\) => setAssistantTalking\(false\)/, 'talking stops when the voice ends');
    assert.match(assistantSource, /function toggleAssistantSound\(\)/, 'the mute toggle lives in the assistant');
    assert.match(assistantSource, /function speakAssistantText\(/, 'bot answers are read aloud');
    assert.match(assistantSource, /if \(role === 'bot'\) speakAssistantText\(/, 'every doorman reply is spoken');
    assert.match(css, /\.assistant-avatar\.is-talking img \{[\s\S]*assistant-head-talk/, 'the head portrait nods while speaking');
    assert.match(serviceWorker, /\.\/icons\/assistant-abbah\.png/);
    assert.match(serviceWorker, /\.\/icons\/assistant-abbah-full\.png/);
    assert.match(assistantSource, /ASSISTANT_FAB_SCROLL_DEADZONE/, 'scroll direction drives the launcher');
    assert.match(assistantSource, /ASSISTANT_FOLLOWUPS/, 'every answer carries follow-up questions');
    assert.match(assistantSource, /isSafeAssistantHtml/, 'a stored chat log is re-checked before it renders');
    assert.match(assistantSource, /sessionStorage\.setItem\(keys\.chat/, 'the chat survives reopening the assistant');
    assert.match(css, /\.assistant-followups \{/);
    assert.match(css, /\.assistant-chip\.is-followup \{/);
    assert.match(css, /\.assistant-typing-dot \{/);
    assert.match(css, /@keyframes assistant-typing-bounce/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.assistant-typing-dot \{ animation: none; \}/);
    assert.match(assistantSource, /window\.addEventListener\('scroll', handleAssistantFabScroll, \{ passive: true \}\)/);
    assert.match(assistantSource, /new MutationObserver\(\(\) => syncAssistantFab\(\)\)\.observe\(modal/);
    assert.doesNotMatch(assistantSource, /addEventListener\('focus'/, 'a visibility-hidden launcher is not focusable, so no focus handler is needed');
    assert.match(css, /\.assistant-msg\.is-user \.assistant-bubble/);
    assert.match(css, /@media print \{\s*#assistantModal \{ display: none !important; \}/);
});

test('عم عبده speaks with one consistent Egyptian voice and a situational sample set', () => {
    const profile = assistantSource.match(/const ASSISTANT_VOICE_PROFILE = Object\.freeze\(\{([\s\S]*?)\}\);/);
    assert.ok(profile, 'the doorman has a single voice profile');
    assert.match(profile[1], /lang: ASSISTANT_SPEECH_LANG/, 'the profile keeps the Egyptian Arabic language');
    assert.match(profile[1], /pitch: ASSISTANT_SPEECH_PITCH/, 'the profile keeps the grandfather pitch');
    assert.match(profile[1], /rate: ASSISTANT_SPEECH_RATE/, 'the profile keeps the unhurried pace');

    // Every utterance is rendered through the shared profile, so the accent and
    // tone never drift from one situation to another.
    assert.match(assistantSource, /utterance\.lang = ASSISTANT_VOICE_PROFILE\.lang/);
    assert.match(assistantSource, /utterance\.pitch = ASSISTANT_VOICE_PROFILE\.pitch/);
    assert.match(assistantSource, /utterance\.rate = ASSISTANT_VOICE_PROFILE\.rate/);
    assert.match(assistantSource, /utterance\.volume = ASSISTANT_VOICE_PROFILE\.volume/);

    const samplesSource = assistantSource.match(/const ASSISTANT_VOICE_SAMPLES = Object\.freeze\(([\s\S]*?)\);/);
    assert.ok(samplesSource, 'the doorman ships a reference sample set');
    const samples = vm.runInNewContext(`(${samplesSource[1]})`);
    assert.ok(Array.isArray(samples) && samples.length >= 6, 'samples cover several everyday situations');

    const keys = new Set();
    for (const sample of samples) {
        assert.equal(typeof sample.key, 'string', 'every sample is addressable by situation key');
        assert.ok(!keys.has(sample.key), `sample key ${sample.key} is unique`);
        keys.add(sample.key);
        assert.match(sample.situation, /[ء-ي]/, 'every sample names its situation in Arabic');
        assert.match(sample.tone, /[ء-ي]/, 'every sample carries a delivery tone');
        assert.match(sample.text, /[ء-ي]/, 'every sample is spoken in Arabic');
    }
    for (const key of ['greeting', 'welcome', 'reassure', 'arrears', 'thanks', 'apology', 'encourage', 'farewell']) {
        assert.ok(keys.has(key), `the sample set covers the ${key} situation`);
    }

    assert.match(assistantSource, /function assistantVoiceSample\(key\)/, 'samples are looked up by situation');
    assert.match(assistantSource, /function speakAssistantSample\(key\)/, 'any surface can audition the voice style');
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
    assert.match(html, /<p><span class="assistant-online-dot" aria-hidden="true"><\/span> واقف على الباب وبيخدمك<\/p>/, 'the head keeps the one-line status note and nothing more');
});

test('assistant runtime keeps chat and voice away from the network and off disk', () => {
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

test('assistant answers are read-only and never write without a confirmation flow', () => {
    // Answering must leave the frozen `state` untouched — even for prompts that
    // sound like a command — because S21 write actions (preview + explicit confirm)
    // are not wired into the assistant yet. This locks the read-only invariant.
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

test('follow-up chips name the month that was just discussed', () => {
    const { api } = createHarness();
    const answer = api.answerAssistantQuery('ملخص أكتوبر 2026', NOW);
    assert.deepEqual(Array.from(answer.followUps, item => item.query), ['مصروفات أكتوبر 2026', 'مين عليه متأخرات؟', 'رصيد الخزنة كام؟']);
    assert.match(answer.html, /class="assistant-followups"/);
    assert.match(answer.html, /data-assistant-query="مصروفات أكتوبر 2026"/);

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
    assert.equal(api.detectOwnerAssistantIntent(api.normalizeAssistantArabic('مين عليه متأخرات')), 'my_bill', 'arrears resolve to the owner’s own debt');
    assert.equal(fresh.api.answerAssistantQuery('مين عليه متأخرات؟', NOW).id, 'my_bill');
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
    assert.match(assistantSource, /const suggestions = assistantIsOwner\(\) \? ASSISTANT_SUGGESTIONS_OWNER : ASSISTANT_SUGGESTIONS;/);
    assert.match(assistantSource, /const map = assistantIsOwner\(\) \? ASSISTANT_FOLLOWUPS_OWNER : ASSISTANT_FOLLOWUPS;/);
    assert.match(supabaseSource, /\.select\('must_change_pin,theme_preference,full_name'\)/, 'the display name rides in with the profile');
    assert.match(supabaseSource, /currentProfileName = typeof profile\?\.full_name/);
    assert.match(supabaseSource, /if \(typeof syncAssistantFab === 'function'\) syncAssistantFab\(\)/, 'the launcher syncs once the session is known');
    assert.match(stateSource, /var currentProfileName = null;/);
    assert.match(appSource, /if \(id !== 'pinLockModal' && !OWNER_ALLOWED_MODALS\.has\(id\) && !requireManager\(\)\) return;/);
    assert.match(appSource, /const OWNER_ALLOWED_MODALS = new Set\(\['assistantModal'\]\);/, 'the assistant is the only modal an owner may open');
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
