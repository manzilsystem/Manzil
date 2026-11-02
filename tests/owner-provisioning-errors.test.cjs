const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const crudSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');

function createHarness(result) {
    const toasts = [];
    const sandbox = {
        console: { error() {} },
        requireManager: () => true,
        supabaseClient: { functions: { invoke: async () => result } },
        toast: message => toasts.push(message),
    };
    const app = vm.runInNewContext(
        `${crudSource}\n({ getOwnerProvisioningErrorCode, provisionOwnerAccess })`,
        sandbox,
        { filename: 'js/crud.js' }
    );
    return { app, toasts };
}

test('a Supabase 409 response shows the specific account-conflict reason, not a connection error', async () => {
    const response = new Response(JSON.stringify({ error: 'phone_already_linked' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
    });
    const { app, toasts } = createHarness({
        data: null,
        error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: response },
    });

    await app.provisionOwnerAccess('resident-id');

    assert.deepEqual(toasts, ['رقم الجوال مربوط بحساب مالك آخر.']);
});

test('a real fetch/network failure keeps the connection message', async () => {
    const { app, toasts } = createHarness({
        data: null,
        error: { name: 'FunctionsFetchError', message: 'Failed to send request to Edge Function' },
    });

    await app.provisionOwnerAccess('resident-id');

    assert.deepEqual(toasts, ['تعذر الاتصال بـ Supabase. تحقق من الإنترنت ثم أعد المحاولة.']);
});
