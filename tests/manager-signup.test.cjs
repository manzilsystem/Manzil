const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('js/manager-signup.js');

function el(value = '') {
    const classes = new Set(['hidden']);
    return { value, textContent: '', innerHTML: '', disabled: false, focus() {},
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => { (on === undefined ? !classes.has(c) : on) ? classes.add(c) : classes.delete(c); }, contains: c => classes.has(c) },
        setAttribute() {} };
}

function setup({ table = {}, rpc = {}, signUp, profile, store = {} } = {}) {
    const els = {};
    const get = id => (els[id] ||= el());
    const calls = { inserts: [], rpcs: [], signOuts: 0, toasts: [] };
    const from = name => ({
        select: () => ({
            limit: async () => (name === 'manager_signup_requests' ? (table.probe ?? { data: [], error: null }) : { data: [], error: null }),
            eq: () => ({
                maybeSingle: async () => (name === 'profiles' ? (profile ?? { data: null, error: null }) : (table.request ?? { data: null, error: null })),
                order: () => ({ limit: async () => ({ data: table.request?.data ? [table.request.data] : [], error: table.request?.error ?? null }), then: undefined })
            })
        }),
        insert: async row => { calls.inserts.push({ name, row }); return { error: table.insertError ?? null }; }
    });
    const sandbox = {
        document: { getElementById: get },
        localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
        supabaseClient: {
            from,
            rpc: async (name, args) => { calls.rpcs.push({ name, args }); return rpc.result ?? { error: null }; },
            auth: { signUp: signUp || (async () => ({ data: { user: { id: 'u1', identities: [{}] }, session: { access_token: 'x' } }, error: null })), signOut: async () => { calls.signOuts += 1; } }
        },
        activeSession: { user: { id: 'u1', email: 'a@b.co' } },
        normalizeOwnerPhone: v => (/^(\+\d{8,15}|01\d{9})$/.test(v) ? v : ''),
        esc: v => String(v), openModal() {}, requireManager: () => true,
        toast: (m, t) => calls.toasts.push([m, t]), confirm: () => true, setTimeout, localStorageKey: ''
    };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(source + '\nthis.api = { submitManagerSignup, resolveMemberlessSignupMessage, refreshSignupAdminEntry, decideSignupRequest };', ctx);
    return { api: ctx.api, els, get, calls, store };
}

function fillForm(t, overrides = {}) {
    const v = { signupFullName: 'محمد', signupEmail: 'A@B.co', signupPhone: '01012345678', signupBuildingName: 'برج الهدى', signupPassword: 'password1', signupPasswordConfirm: 'password1', ...overrides };
    for (const [k, val] of Object.entries(v)) t.get(k).value = val;
}

test('no network request is made before login, and admin check fails silently', async () => {
    const t = setup({ profile: { data: null, error: { code: '42703' } } });
    assert.equal(t.get('managerSignupLink').classList.contains('hidden'), true);
    assert.equal(await t.api.resolveMemberlessSignupMessage({ user: { id: '' } }), '');
    await t.api.refreshSignupAdminEntry();
    assert.equal(t.get('signupAdminBtn').classList.contains('hidden'), true);
    assert.equal(t.calls.inserts.length, 0);
});

test('login screen never probes the signup table for anonymous visitors', () => {
    assert.doesNotMatch(read('js/supabase.js'), /refreshManagerSignupLink/);
    assert.doesNotMatch(source, /limit\(1\);\s*\/\/ خطأ الصلاحيات/);
    assert.match(read('index.html'), /id="managerSignupLink" type="button" onclick="openManagerSignup\(\)" class="auth-link-button mt-3">/);
});

test('signup validates fields, then signs up and inserts a pending request', async () => {
    const t = setup();
    fillForm(t, { signupPhone: '123' });
    await t.api.submitManagerSignup({ preventDefault() {} });
    assert.match(t.get('managerSignupMessage').textContent, /رقم الجوال غير صحيح/);
    assert.equal(t.calls.inserts.length, 0);
    fillForm(t);
    await t.api.submitManagerSignup({ preventDefault() {} });
    assert.equal(t.calls.inserts.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(t.calls.inserts[0].row)), { user_id: 'u1', full_name: 'محمد', phone: '01012345678', building_name: 'برج الهدى' });
    assert.equal(t.calls.signOuts, 1);
    assert.match(t.get('managerSignupMessage').textContent, /بانتظار التفعيل/);
});

test('signup rejects mismatched password confirmation', async () => {
    const t = setup();
    fillForm(t, { signupPasswordConfirm: 'different1' });
    await t.api.submitManagerSignup({ preventDefault() {} });
    assert.equal(t.calls.inserts.length, 0);
    assert.match(t.get('managerSignupMessage').textContent, /مش متطابقتين/);
});

test('signup with email confirmation on keeps the data locally and tells the user to check email', async () => {
    const t = setup({ signUp: async () => ({ data: { user: { id: 'u2', identities: [{}] }, session: null }, error: null }) });
    fillForm(t);
    await t.api.submitManagerSignup({ preventDefault() {} });
    assert.equal(t.calls.inserts.length, 0);
    assert.match(t.get('managerSignupMessage').textContent, /تأكد من إيميلك/);
    assert.ok(t.store['manzil.managerSignupPending:a@b.co']);
    const message = await t.api.resolveMemberlessSignupMessage({ user: { id: 'u2', email: 'a@b.co' } });
    assert.equal(message, 'حسابك بانتظار التفعيل');
    assert.equal(t.calls.inserts.length, 1);
    assert.equal(t.store['manzil.managerSignupPending:a@b.co'], undefined);
});

test('memberless login shows pending or rejected, otherwise falls back to the original error', async () => {
    const pending = setup({ table: { request: { data: { id: 'r', status: 'pending' }, error: null } } });
    assert.equal(await pending.api.resolveMemberlessSignupMessage({ user: { id: 'u1' } }), 'حسابك بانتظار التفعيل');
    const rejected = setup({ table: { request: { data: { id: 'r', status: 'rejected' }, error: null } } });
    assert.match(await rejected.api.resolveMemberlessSignupMessage({ user: { id: 'u1' } }), /اترفض/);
    const none = setup();
    assert.equal(await none.api.resolveMemberlessSignupMessage({ user: { id: 'u1', email: 'x@y.z' } }), '');
});

test('only a super admin sees the requests button, and decisions call the RPCs', async () => {
    const admin = setup({ profile: { data: { is_super_admin: true }, error: null } });
    await admin.api.refreshSignupAdminEntry();
    assert.equal(admin.get('signupAdminBtn').classList.contains('hidden'), false);
    const normal = setup({ profile: { data: { is_super_admin: false }, error: null } });
    await normal.api.refreshSignupAdminEntry();
    assert.equal(normal.get('signupAdminBtn').classList.contains('hidden'), true);
    await admin.api.decideSignupRequest('req-1', 'activate');
    await admin.api.decideSignupRequest('req-2', 'reject');
    assert.deepEqual(admin.calls.rpcs.map(c => c.name), ['activate_manager_signup', 'reject_manager_signup']);
    assert.deepEqual(admin.calls.rpcs.map(c => c.args.request_id), ['req-1', 'req-2']);
});

test('wiring: login falls back safely, script is loaded, and SQL is not in the migrations path', () => {
    assert.match(read('js/supabase.js'), /resolveMemberlessSignupMessage\(session\)/);
    assert.match(read('index.html'), /<script src="js\/manager-signup\.js/);
    for (const id of ['managerSignupModal', 'managerSignupLink', 'signupAdminBtn', 'signupRequestsModal']) assert.ok(read('index.html').includes(`id="${id}"`), id);
    const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).join('\n');
    assert.doesNotMatch(migrations, /signup_activation|manager_signup/i);
});
