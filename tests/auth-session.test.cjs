const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const supabaseSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');

function makeClassList() {
    const values = new Set();
    return {
        add: (...tokens) => tokens.forEach(token => values.add(token)),
        remove: (...tokens) => tokens.forEach(token => values.delete(token)),
        toggle(token, force) {
            const shouldAdd = force === undefined ? !values.has(token) : force;
            if (shouldAdd) values.add(token);
            else values.delete(token);
            return shouldAdd;
        },
        contains: token => values.has(token),
    };
}

function makeHarness() {
    const queuedTimers = [];
    const elements = new Map();
    const makeElement = () => ({
        classList: makeClassList(),
        value: '',
        textContent: '',
        disabled: false,
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        focus() {},
    });
    for (const id of [
        'pinLockModal', 'pinErrorMsg', 'authIdentifier', 'authPassword', 'accessSwitchBtn',
        'ownerPortal', 'ownerPinChangeModal', 'ownerTempPinModal', 'ownerTempPinValue',
        'currentOwnerPin', 'newOwnerPin', 'confirmOwnerPin', 'syncStatus',
    ]) elements.set(id, makeElement());

    const button = makeElement();
    let authListener = null;
    const client = {
        auth: {
            signInWithPassword: async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null }),
            signOut: async () => ({ error: null }),
            getSession: async () => ({ data: { session: null }, error: null }),
            onAuthStateChange: callback => { authListener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
        },
    };
    const sandbox = {
        window: { supabase: { createClient: () => client } },
        document: {
            body: { classList: makeClassList(), attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } },
            getElementById: id => elements.get(id) || null,
            querySelector: () => ({ setAttribute() {} }),
        },
        setTimeout: callback => { queuedTimers.push(callback); return queuedTimers.length; },
        console: { error() {} },
        clearOwnerPortal() { this.ownerPortalCleared = true; },
        renderAll() { this.renderCount = (this.renderCount || 0) + 1; },
        ownerPortalCleared: false,
        renderCount: 0,
        state: {
            buildingName: '', managerName: '', managerPhone: '', defaultSubscription: 0, startingBalance: 0,
            currentTheme: 'dark', residents: [], income: [], expenses: [], notices: [], auditLogs: [], lastUpdated: 0,
        },
        currentUserRole: null,
        currentResidentId: null,
    };
    const app = vm.runInNewContext(
        `${supabaseSource}\n({\n` +
        'submitSupabaseLogin, setLoginMode, lockCurrentSession, initSupabaseApp, ' +
        'setLoadState(fn) { loadState = fn; }, ' +
        'setOpenAuthenticatedApp(fn) { openAuthenticatedApp = fn; }, ' +
        'getSnapshot() { return { activeSession, activeBuildingId, supabaseStateLoaded, authLoading, ownerMustChangePin, state, currentUserRole, currentResidentId }; }, ' +
        'setSnapshot(values) { ' +
        'if ("activeSession" in values) activeSession = values.activeSession; ' +
        'if ("activeBuildingId" in values) activeBuildingId = values.activeBuildingId; ' +
        'if ("supabaseStateLoaded" in values) supabaseStateLoaded = values.supabaseStateLoaded; ' +
        'if ("state" in values) state = values.state; ' +
        'if ("currentUserRole" in values) currentUserRole = values.currentUserRole; ' +
        'if ("currentResidentId" in values) currentResidentId = values.currentResidentId; }, ' +
        'getClient() { return supabaseClient; }' +
        '})',
        sandbox,
        { filename: 'js/supabase.js' }
    );

    return {
        app, sandbox, client, button, elements, queuedTimers,
        makeSubmitEvent() {
            return {
                preventDefault() {},
                submitter: button,
                target: { querySelector: () => button },
            };
        },
        async flushTimers() {
            while (queuedTimers.length) {
                const callbacks = queuedTimers.splice(0);
                for (const callback of callbacks) await callback();
            }
        },
        getAuthListener: () => authListener,
    };
}

test('a rejected login request restores the button and displays a recoverable connection message', async () => {
    const h = makeHarness();
    h.elements.get('authIdentifier').value = 'manager@example.com';
    h.elements.get('authPassword').value = 'secret';
    h.client.auth.signInWithPassword = async () => { throw new Error('network unavailable'); };

    await assert.doesNotReject(h.app.submitSupabaseLogin(h.makeSubmitEvent()));

    assert.equal(h.button.disabled, false);
    assert.equal(h.app.getSnapshot().authLoading, false);
    assert.match(h.elements.get('pinErrorMsg').textContent, /تعذر الاتصال بخدمة المصادقة/);
    assert.equal(h.app.getSnapshot().activeSession, null);
});

test('manager mode rejects a phone number before contacting Supabase', async () => {
    const h = makeHarness();
    h.elements.get('authIdentifier').value = '01012345678';
    h.elements.get('authPassword').value = '123456';
    let called = false;
    h.client.auth.signInWithPassword = async () => { called = true; return { data: {}, error: null }; };

    await h.app.submitSupabaseLogin(h.makeSubmitEvent());

    assert.equal(called, false);
    assert.match(h.elements.get('pinErrorMsg').textContent, /دخول المدير يحتاج البريد الإلكتروني/);
});

test('owner mode rejects an email before contacting Supabase', async () => {
    const h = makeHarness();
    h.app.setLoginMode('owner');
    h.elements.get('authIdentifier').value = 'owner@example.com';
    h.elements.get('authPassword').value = '123';
    let called = false;
    h.client.auth.signInWithPassword = async () => { called = true; return { data: {}, error: null }; };

    await h.app.submitSupabaseLogin(h.makeSubmitEvent());

    assert.equal(called, false);
    assert.match(h.elements.get('pinErrorMsg').textContent, /رقم الجوال المسجل/);
});

test('owner mode rejects a PIN shorter than six digits before contacting Supabase', async () => {
    const h = makeHarness();
    h.app.setLoginMode('owner');
    h.elements.get('authIdentifier').value = '01012345678';
    h.elements.get('authPassword').value = '123';
    let called = false;
    h.client.auth.signInWithPassword = async () => { called = true; return { data: {}, error: null }; };

    await h.app.submitSupabaseLogin(h.makeSubmitEvent());

    assert.equal(called, false);
    assert.match(h.elements.get('pinErrorMsg').textContent, /PIN المالك يجب أن يتكون من 6 أرقام/);
});

test('a failed local sign-out does not prevent locking the interface or clearing prior account data', async () => {
    const h = makeHarness();
    h.app.setSnapshot({
        activeSession: { user: { id: 'previous-user' } },
        activeBuildingId: 'building-1',
        supabaseStateLoaded: true,
        currentUserRole: 'owner',
        currentResidentId: 'resident-1',
        state: {
            buildingName: 'بيانات سابقة', managerName: 'مدير', managerPhone: '', defaultSubscription: 100,
            startingBalance: 0, currentTheme: 'dark', residents: [{ id: 'resident-1', name: 'مالك' }],
            income: [{ id: 'income-1', amount: 100 }], expenses: [], notices: [], auditLogs: [], lastUpdated: Date.now(),
        },
    });
    h.elements.get('authIdentifier').value = 'owner@example.test';
    h.elements.get('authPassword').value = 'secret';
    h.elements.get('currentOwnerPin').value = '123456';
    h.elements.get('newOwnerPin').value = '654321';
    h.client.auth.signOut = async options => {
        assert.deepEqual(JSON.parse(JSON.stringify(options)), { scope: 'local' });
        throw new Error('offline');
    };

    await assert.doesNotReject(h.app.lockCurrentSession());

    const snapshot = h.app.getSnapshot();
    assert.equal(snapshot.activeSession, null);
    assert.equal(snapshot.activeBuildingId, null);
    assert.equal(snapshot.supabaseStateLoaded, false);
    assert.equal(snapshot.currentUserRole, null);
    assert.equal(snapshot.currentResidentId, null);
    assert.deepEqual(Array.from(snapshot.state.residents), []);
    assert.deepEqual(Array.from(snapshot.state.income), []);
    assert.equal(snapshot.state.buildingName, '');
    assert.equal(h.sandbox.document.body.classList.contains('session-locked'), true);
    assert.match(h.elements.get('pinErrorMsg').textContent, /تم قفل الواجهة/);
    assert.equal(h.elements.get('authIdentifier').value, '');
    assert.equal(h.elements.get('ownerTempPinValue').value, '');
    assert.equal(h.elements.get('authPassword').value, '');
    assert.equal(h.elements.get('currentOwnerPin').value, '');
    assert.equal(h.elements.get('newOwnerPin').value, '');
});

test('a Supabase SIGNED_OUT event clears account data and returns to the login modal', async () => {
    const h = makeHarness();
    await h.app.initSupabaseApp();
    h.app.setSnapshot({
        activeSession: { user: { id: 'previous-user' } },
        activeBuildingId: 'building-1',
        supabaseStateLoaded: true,
        currentUserRole: 'manager',
        state: {
            buildingName: 'بيانات سابقة', managerName: '', managerPhone: '', defaultSubscription: 0,
            startingBalance: 0, currentTheme: 'dark', residents: [{ id: 'resident-1' }],
            income: [{ id: 'income-1' }], expenses: [], notices: [], auditLogs: [], lastUpdated: Date.now(),
        },
    });

    h.getAuthListener()('SIGNED_OUT', null);
    await h.flushTimers();

    const snapshot = h.app.getSnapshot();
    assert.equal(snapshot.activeSession, null);
    assert.equal(snapshot.supabaseStateLoaded, false);
    assert.deepEqual(Array.from(snapshot.state.residents), []);
    assert.deepEqual(Array.from(snapshot.state.income), []);
    assert.equal(snapshot.state.buildingName, '');
    assert.equal(h.elements.get('pinLockModal').classList.contains('hidden'), false);
    assert.equal(h.sandbox.document.body.classList.contains('session-locked'), true);
});

test('a sign-out during loadState prevents stale data from reopening the authenticated app', async () => {
    const h = makeHarness();
    let finishLoad;
    let markLoadStarted;
    const loadStarted = new Promise(resolve => { markLoadStarted = resolve; });
    const pendingLoad = new Promise(resolve => { finishLoad = resolve; });
    let openCount = 0;
    h.client.auth.getSession = async () => ({
        data: { session: { user: { id: 'user-1' } } }, error: null,
    });
    h.app.setLoadState(async () => {
        markLoadStarted();
        await pendingLoad;
        h.app.setSnapshot({
            state: {
                buildingName: 'بيانات الجلسة القديمة', managerName: 'مدير سابق', managerPhone: '',
                defaultSubscription: 100, startingBalance: 0, currentTheme: 'dark',
                residents: [{ id: 'stale-resident' }], income: [], expenses: [], notices: [], auditLogs: [], lastUpdated: 1,
            },
        });
        return true;
    });
    h.app.setOpenAuthenticatedApp(async () => { openCount += 1; });

    const initialization = h.app.initSupabaseApp();
    await loadStarted;
    h.getAuthListener()('SIGNED_OUT', null);
    finishLoad();
    await initialization;
    await h.flushTimers();

    const snapshot = h.app.getSnapshot();
    assert.equal(snapshot.activeSession, null);
    assert.equal(snapshot.supabaseStateLoaded, false);
    assert.equal(snapshot.state.buildingName, '');
    assert.deepEqual(Array.from(snapshot.state.residents), []);
    assert.equal(openCount, 0);
    assert.equal(h.elements.get('pinLockModal').classList.contains('hidden'), false);
});

test('a temporary getSession failure still leaves the auth listener available for later sign-out events', async () => {
    const h = makeHarness();
    h.client.auth.getSession = async () => { throw new Error('network unavailable'); };

    await assert.doesNotReject(h.app.initSupabaseApp());

    assert.equal(typeof h.getAuthListener(), 'function');
    assert.match(h.elements.get('pinErrorMsg').textContent, /تعذر الاتصال بخدمة المصادقة/);
    h.app.setSnapshot({
        activeSession: { user: { id: 'previous-user' } },
        state: {
            buildingName: 'بيانات سابقة', managerName: '', managerPhone: '', defaultSubscription: 0,
            startingBalance: 0, currentTheme: 'dark', residents: [{ id: 'resident-1' }],
            income: [], expenses: [], notices: [], auditLogs: [], lastUpdated: Date.now(),
        },
    });

    h.getAuthListener()('SIGNED_OUT', null);
    await h.flushTimers();

    assert.equal(h.app.getSnapshot().activeSession, null);
    assert.deepEqual(Array.from(h.app.getSnapshot().state.residents), []);
});
