'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const http = require('node:http');

const root = path.join(__dirname, '..');
const clientSource = fs.readFileSync(path.join(root, 'js', 'assistant-groq.js'), 'utf8');
const assistantSource = fs.readFileSync(path.join(root, 'js', 'assistant.js'), 'utf8');
const template = fs.readFileSync(path.join(root, 'src', 'index.template.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function bareModule(source, extra = {}) {
    const sandbox = { module: { exports: {} }, ...extra };
    vm.runInNewContext(source, sandbox);
    return { api: sandbox.module.exports, sandbox };
}

function fakeDocument() {
    return {
        createElement() {
            const node = { textContent: '' };
            Object.defineProperty(node, 'innerHTML', {
                set(value) { node.textContent = String(value).replace(/<[^>]*>/g, ' '); },
                get() { return ''; }
            });
            return node;
        },
        querySelector() { return null; }
    };
}

function freePort() {
    return new Promise(resolve => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

test('the Groq bridge is local-only and keeps the deterministic engine intact', () => {
    assert.doesNotMatch(clientSource, /api\.groq\.com|gsk_[A-Za-z0-9]{20,}/,
        'the browser never sees the Groq host or key');
    assert.match(clientSource, /assistantGroqIsLocalHost/);
    assert.match(clientSource, /\/api\/groq\/chat/, 'the browser calls a same-origin route');
    assert.match(assistantSource, /assistantGlobalFunction\('assistantGroqAnswer'\)/,
        'assistant.js uses a small optional hook');
    assert.doesNotMatch(assistantSource, /\bfetch\s*\(/, 'assistant.js still has no network code');
    assert.match(template, /js\/assistant-groq\.js/);
    assert.match(serviceWorker, /\.\/js\/assistant-groq\.js/);
    assert.equal(packageJson.scripts['dev:groq'], 'node scripts/groq-dev-server.mjs');
});

test('the bridge only runs on localhost and only rewrites read-only data answers', () => {
    const { api } = bareModule(clientSource);
    assert.equal(api.assistantGroqIsLocalHost('localhost'), true);
    assert.equal(api.assistantGroqIsLocalHost('127.0.0.1'), true);
    assert.equal(api.assistantGroqIsLocalHost('[::1]'), true);
    assert.equal(api.assistantGroqIsLocalHost('manzil.example'), false);
    assert.equal(api.assistantGroqIsLocalHost(''), false);

    assert.equal(api.assistantGroqCanRewrite({ id: 'cashbox', html: '<p>رصيد</p>' }), true);
    assert.equal(api.assistantGroqCanRewrite({ id: 'compound', html: '<p>ملخص</p>' }), true);
    assert.equal(api.assistantGroqCanRewrite({ id: 'operation-confirm-request', html: '<p>حفظ</p>' }), false);
    assert.equal(api.assistantGroqCanRewrite({ id: 'notice-confirm-request', html: '<p>نشر</p>' }), false);
    assert.equal(api.assistantGroqCanRewrite({ id: 'operation-cancelled', html: '<p>إلغاء</p>' }), false);
    assert.equal(api.assistantGroqCanRewrite({ id: 'access-denied', html: '<p>رفض</p>' }), false);
    assert.equal(api.assistantGroqCanRewrite({ id: 'unknown', html: '<p>؟</p>' }), false);
    assert.equal(api.assistantGroqCanRewrite({ id: 'cashbox', html: '   ' }), false);
});

test('facts are extracted from rendered local text and model output is escaped', () => {
    const { api } = bareModule(clientSource);
    const doc = fakeDocument();
    assert.equal(api.assistantGroqPlainText('<p>رصيد <b>100</b> جنيه</p>', doc), 'رصيد 100 جنيه');
    assert.match(api.assistantGroqEscape('<img src=x onerror="alert(1)">'), /^&lt;img/);
    assert.doesNotMatch(api.assistantGroqEscape('<img src=x onerror="alert(1)">'), /<img/);
});

test('the browser hook sends only approved facts through the same-origin proxy', async () => {
    const calls = [];
    const fetch = async (url, options) => {
        calls.push({ url, options });
        if (url === '/api/groq/health') return { ok: true, json: async () => ({ enabled: true }) };
        if (url === '/api/groq/chat') {
            return { ok: true, json: async () => ({ content: 'الخزنة فيها 100 جنيه.\nراجع التقارير.' }) };
        }
        throw new Error(`unexpected fetch: ${url}`);
    };
    const { sandbox } = bareModule(clientSource, {
        fetch,
        document: fakeDocument(),
        currentUserRole: 'manager',
        location: { hostname: '127.0.0.1' }
    });
    await sandbox.assistantGroqHealth;
    const answer = await sandbox.assistantGroqAnswer('رصيد الخزنة كام؟', {
        id: 'cashbox', title: 'أرصدة الخزائن', html: '<p>الخزنة الرئيسية: 100 جنيه</p>', followUps: ['ملخص الشهر']
    });
    assert.equal(answer.source, 'groq');
    assert.equal(answer.id, 'cashbox');
    assert.deepEqual(answer.followUps, ['ملخص الشهر']);
    assert.match(answer.html, /الخزنة فيها 100 جنيه/);
    assert.match(answer.html, /صياغة Groq تجريبية/);
    assert.equal(calls[0].url, '/api/groq/health');
    assert.equal(calls[1].url, '/api/groq/chat');
    const sent = JSON.parse(calls[1].options.body);
    assert.match(sent.messages[0].content, /الحقائق المقدمة فقط/);
    assert.match(sent.messages[1].content, /الخزنة الرئيسية: 100 جنيه/);
    assert.doesNotMatch(JSON.stringify(sent), /api\.groq\.com|gsk_/);
    assert.equal(await sandbox.assistantGroqAnswer('سجل تحصيل', {
        id: 'operation-confirm-request', html: '<p>جارٍ الحفظ</p>'
    }), null);
});

test('the hook is not installed when the local proxy is unavailable', async () => {
    const { sandbox } = bareModule(clientSource, {
        fetch: async () => ({ ok: false }),
        document: fakeDocument(),
        location: { hostname: '127.0.0.1' }
    });
    assert.equal(await sandbox.assistantGroqHealth, false);
    assert.equal(sandbox.assistantGroqAnswer, undefined,
        'a static build or e2e server keeps the synchronous local path');
});

test('the dev proxy forwards the key server-side and never returns it', async () => {
    // Deliberately shorter than a real Groq key so the secret scanner never
    // mistakes this fixture for a credential.
    const fakeKey = 'gsk_localproxytest';
    let upstreamAuth = '';
    let upstreamBody = null;
    const upstream = http.createServer((request, response) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            upstreamAuth = String(request.headers.authorization || '');
            upstreamBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ choices: [{ message: { content: 'رد تجريبي من Groq' } }] }));
        });
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const upstreamPort = upstream.address().port;
    const port = await freePort();
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'groq-dev-server.mjs')], {
        cwd: root,
        env: {
            ...process.env,
            GROQ_DEV_PORT: String(port),
            GROQ_API_BASE: `http://127.0.0.1:${upstreamPort}/v1`,
            GROQ_API_KEY: fakeKey
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const base = `http://127.0.0.1:${port}`;
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    try {
        let health = null;
        for (let attempt = 0; attempt < 40 && !health; attempt += 1) {
            try {
                const response = await fetch(`${base}/api/groq/health`);
                if (response.ok) health = await response.json();
            } catch (error) {
                await new Promise(resolve => setTimeout(resolve, 25));
            }
        }
        assert.ok(health, `dev server did not start: ${stderr}`);
        assert.equal(health.enabled, true);
        assert.doesNotMatch(JSON.stringify(health), /gsk_/);

        const chat = await fetch(`${base}/api/groq/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'رصيد الخزنة كام؟' }] })
        });
        assert.equal(chat.status, 200);
        const reply = await chat.json();
        assert.equal(reply.content, 'رد تجريبي من Groq');
        assert.doesNotMatch(JSON.stringify(reply), /gsk_/);
        assert.equal(upstreamAuth, `Bearer ${fakeKey}`);
        assert.equal(upstreamBody.model, 'openai/gpt-oss-20b');
        assert.equal(upstreamBody.messages[0].content, 'رصيد الخزنة كام؟');

        const invalid = await fetch(`${base}/api/groq/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'root', content: 'x' }] })
        });
        assert.equal(invalid.status, 400);
        assert.doesNotMatch(await invalid.text(), /gsk_/);
    } finally {
        child.kill();
        await new Promise(resolve => upstream.close(resolve));
    }
});

test('secret scanning recognises Groq keys', () => {
    const { findSecrets } = require('../scripts/check-secrets.cjs');
    const longKey = `gsk_${'a'.repeat(26)}`;
    assert.ok(findSecrets(`GROQ_API_KEY=${longKey}`).some(item => item.name === 'groq_api_key'));
    assert.deepEqual(findSecrets('GROQ_API_KEY=\n# gsk_ قصير'), []);
});
