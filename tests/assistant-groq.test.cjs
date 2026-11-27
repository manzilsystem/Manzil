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

test('the Groq bridge keeps the deterministic engine intact and hides the key', () => {
    assert.doesNotMatch(clientSource, /api\.groq\.com|gsk_[A-Za-z0-9]{20,}/,
        'the browser never sees the Groq host or key');
    assert.match(clientSource, /assistantGroqIsLocalHost/);
    assert.match(clientSource, /\/api\/groq\/chat/, 'localhost uses a same-origin dev route');
    assert.match(clientSource, /\/api\/groq\/speak/, 'localhost TTS uses the same-origin dev route');
    assert.match(clientSource, /\/functions\/v1\/assistant-groq/, 'production uses the Supabase function');
    assert.match(clientSource, /assistantGroqTranscribe/);
    assert.match(clientSource, /assistantGroqSpeak/, 'Groq audio is the primary reply voice');
    assert.ok(clientSource.includes(".replace(/أ\\s*\\/\\s*/g, 'أستاذ ')"),
        'the أ/ abbreviation is expanded in text and speech');
    assert.match(assistantSource, /assistantGlobalFunction\('assistantGroqAnswer'\)/,
        'assistant.js uses a small optional hook');
    assert.doesNotMatch(assistantSource, /\bfetch\s*\(/, 'assistant.js still has no network code');
    assert.match(template, /js\/assistant-groq\.js/);
    assert.match(serviceWorker, /\.\/js\/assistant-groq\.js/);
    assert.equal(packageJson.scripts['dev:groq'], 'node scripts/groq-dev-server.mjs');
});

test('the bridge only runs on localhost and only rewrites read-only data answers', () => {
    const { api } = bareModule(clientSource, { location: { hostname: '127.0.0.1', port: '8787' } });
    assert.equal(api.assistantGroqIsLocalHost('localhost'), true);
    assert.equal(api.assistantGroqIsLocalHost('127.0.0.1'), true);
    assert.equal(api.assistantGroqIsLocalHost('[::1]'), true);
    assert.equal(api.assistantGroqIsLocalHost('manzil.example'), false);
    assert.equal(api.assistantGroqIsLocalHost(''), false);
    const endpoint = api.assistantGroqEndpoint();
    assert.equal(endpoint.local, true);
    assert.equal(endpoint.url, '');

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

test('أ/ is expanded to أستاذ in rendered facts and questions', () => {
    const { api } = bareModule(clientSource);
    assert.equal(api.assistantGroqExpandAbbreviations('أ/سمير الشافعي'), 'أستاذ سمير الشافعي');
    assert.equal(api.assistantGroqExpandAbbreviations('  أ /  سمير   الشافعي  '), 'أستاذ سمير الشافعي');
    assert.equal(api.assistantGroqPlainText('<p>أ/سمير الشافعي: 100 جنيه</p>', fakeDocument()), 'أستاذ سمير الشافعي: 100 جنيه');
});

test('the browser hook sends only approved facts through the same-origin proxy', async () => {
    const calls = [];
    const fetch = async (url, options) => {
        calls.push({ url, options });
        if (url === '/api/groq/health') return { ok: true, json: async () => ({ enabled: true }) };
        if (url === '/api/groq/chat') {
            return { ok: true, json: async () => ({ content: 'الخزنة فيها 100 جنيه.\nراجع التقارير.' }) };
        }
        if (url === '/api/groq/speak') {
            return { ok: true, blob: async () => ({ size: 128 }) };
        }
        throw new Error(`unexpected fetch: ${url}`);
    };
    const { sandbox } = bareModule(clientSource, {
        fetch,
        document: fakeDocument(),
        currentUserRole: 'manager',
        location: { hostname: '127.0.0.1', port: '8787' }
    });
    await sandbox.assistantGroqHealth;
    const answer = await sandbox.assistantGroqAnswer('رصيد الخزنة كام؟', {
        id: 'cashbox', title: 'أرصدة الخزائن', html: '<p>الخزنة الرئيسية: 100 جنيه</p>', followUps: ['ملخص الشهر']
    });
    assert.equal(answer.source, 'groq');
    assert.equal(answer.id, 'cashbox');
    assert.deepEqual(answer.followUps, ['ملخص الشهر']);
    assert.match(answer.html, /الخزنة فيها 100 جنيه/);
    assert.match(answer.html, /صياغة ذكية/);
    assert.equal(calls[0].url, '/api/groq/health');
    assert.equal(calls[1].url, '/api/groq/chat');
    const sent = JSON.parse(calls[1].options.body);
    assert.equal(sent.action, 'chat');
    assert.equal(sent.answerId, 'cashbox');
    assert.equal(sent.role, 'manager');
    assert.equal(sent.question, 'رصيد الخزنة كام؟');
    assert.match(sent.facts, /الخزنة الرئيسية: 100 جنيه/);
    assert.equal(sent.messages, undefined, 'the server owns the system prompt');
    assert.doesNotMatch(JSON.stringify(sent), /api\.groq\.com|gsk_/);

    const audio = await sandbox.assistantGroqSpeak('أ/سمير الشافعي: الخزنة 100 جنيه');
    assert.equal(audio.size, 128);
    assert.equal(calls[2].url, '/api/groq/speak');
    assert.equal(calls[2].options.headers.Accept, 'audio/wav');
    const speech = JSON.parse(calls[2].options.body);
    assert.equal(speech.action, 'speak');
    assert.equal(speech.text, 'أستاذ سمير الشافعي: الخزنة 100 جنيه');
    assert.doesNotMatch(JSON.stringify(speech), /api\.groq\.com|gsk_/);

    assert.equal(await sandbox.assistantGroqAnswer('سجل تحصيل', {
        id: 'operation-confirm-request', html: '<p>جارٍ الحفظ</p>'
    }), null);
});

test('the hook is not installed when the local proxy is unavailable', async () => {
    const { sandbox } = bareModule(clientSource, {
        fetch: async () => ({ ok: false }),
        document: fakeDocument(),
        location: { hostname: '127.0.0.1', port: '8787' }
    });
    assert.equal(await sandbox.assistantGroqHealth, false);
    assert.equal(sandbox.assistantGroqAnswer, undefined,
        'a static build or e2e server keeps the synchronous local path');
});

test('a static localhost preview never probes the missing dev routes', async () => {
    const { api, sandbox } = bareModule(clientSource, {
        fetch: async url => { throw new Error(`unexpected fetch: ${url}`); },
        document: fakeDocument(),
        location: { hostname: '127.0.0.1', port: '8123' }
    });
    assert.equal(api.assistantGroqUseLocalProxy(), false);
    assert.equal(api.assistantGroqEndpoint(), null);
    assert.equal(await sandbox.assistantGroqHealth, false);
    assert.equal(sandbox.assistantGroqAnswer, undefined);
    assert.equal(sandbox.assistantGroqTranscribe, undefined);
    assert.equal(sandbox.assistantGroqSpeak, undefined);
});

test('a custom-port dev proxy is detected from the marker injected into its HTML', () => {
    const { api } = bareModule(clientSource, {
        location: { hostname: '127.0.0.1', port: '9999' },
        manzilGroqDevProxy: true
    });
    assert.equal(api.assistantGroqUseLocalProxy(), true);
    const endpoint = api.assistantGroqEndpoint();
    assert.equal(endpoint.local, true);
});

test('production uses the authenticated Supabase function instead of a local proxy', async () => {
    const calls = [];
    let requestCount = 0;
    const fetch = async (url, options) => {
        calls.push({ url, options });
        requestCount += 1;
        if (String(url).includes('/functions/v1/assistant-groq')) {
            if (typeof options.body === 'string' && JSON.parse(options.body).action === 'speak') {
                return { ok: true, blob: async () => ({ size: 256 }) };
            }
            return { ok: true, json: async () => requestCount === 2
                ? { text: 'رصيد الخزنة كام؟' } : { content: 'الخزنة فيها 100 جنيه.' } };
        }
        throw new Error(`unexpected fetch: ${url}`);
    };
    const { sandbox } = bareModule(clientSource, {
        fetch,
        document: fakeDocument(),
        location: { hostname: 'manzilsystem.github.io' },
        manzilSupabaseConfig: { url: 'https://proj.supabase.co/' },
        supabaseClient: { auth: { getSession: async () => ({ data: { session: { access_token: 'fake-jwt' } } }) } },
        FormData,
        Blob
    });
    await sandbox.assistantGroqHealth;
    const answer = await sandbox.assistantGroqAnswer('رصيد الخزنة كام؟', {
        id: 'cashbox', title: 'أرصدة الخزائن', html: '<p>الخزنة الرئيسية: 100 جنيه</p>'
    });
    assert.equal(answer.source, 'groq');
    assert.equal(calls[0].url, 'https://proj.supabase.co/functions/v1/assistant-groq');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer fake-jwt');
    assert.equal(JSON.parse(calls[0].options.body).answerId, 'cashbox');

    const transcript = await sandbox.assistantGroqTranscribe(new Blob([new Uint8Array(1024)]));
    assert.equal(transcript, 'رصيد الخزنة كام؟');
    assert.equal(calls[1].url, 'https://proj.supabase.co/functions/v1/assistant-groq');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer fake-jwt');
    assert.equal(calls[1].options.headers['Content-Type'], undefined, 'FormData sets its own boundary');
    assert.match(String(calls[1].options.body), /\[object FormData\]|formData|FormData/);

    const audio = await sandbox.assistantGroqSpeak('أ/سمير الشافعي');
    assert.equal(audio.size, 256);
    assert.equal(calls[2].url, 'https://proj.supabase.co/functions/v1/assistant-groq');
    assert.equal(calls[2].options.headers.Authorization, 'Bearer fake-jwt');
    assert.equal(JSON.parse(calls[2].options.body).text, 'أستاذ سمير الشافعي');
});

test('the dev proxy forwards the key server-side and never returns it', async () => {
    // Deliberately shorter than a real Groq key so the secret scanner never
    // mistakes this fixture for a credential.
    const fakeKey = 'gsk_localproxytest';
    let upstreamAuth = '';
    let upstreamBody = null;
    let upstreamPath = '';
    const upstream = http.createServer((request, response) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            upstreamAuth = String(request.headers.authorization || '');
            upstreamPath = String(request.url || '');
            if (upstreamPath.includes('/audio/transcriptions')) {
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ text: 'رصيد الخزنة كام؟' }));
                return;
            }
            upstreamBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (upstreamPath.includes('/audio/speech')) {
                response.writeHead(200, { 'Content-Type': 'audio/wav' });
                response.end(Buffer.alloc(128));
                return;
            }
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
        assert.equal(health.ttsModel, 'canopylabs/orpheus-arabic-saudi');
        assert.equal(health.ttsVoice, 'abdullah');
        assert.doesNotMatch(JSON.stringify(health), /gsk_/);

        const indexResponse = await fetch(`${base}/index.html`);
        assert.equal(indexResponse.status, 200);
        assert.match(await indexResponse.text(), /manzilGroqDevProxy\s*=\s*true/);

        const chat = await fetch(`${base}/api/groq/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'chat', answerId: 'cashbox', question: 'رصيد الخزنة كام؟',
                facts: 'الخزنة الرئيسية: 100 جنيه', role: 'manager'
            })
        });
        assert.equal(chat.status, 200);
        const reply = await chat.json();
        assert.equal(reply.content, 'رد تجريبي من Groq');
        assert.doesNotMatch(JSON.stringify(reply), /gsk_/);
        assert.equal(upstreamAuth, `Bearer ${fakeKey}`);
        assert.equal(upstreamBody.model, 'qwen/qwen3.8-27b');
        assert.equal(upstreamBody.messages[0].role, 'system');
        assert.match(upstreamBody.messages[1].content, /الخزنة الرئيسية: 100 جنيه/);

        const form = new FormData();
        form.append('action', 'transcribe');
        form.append('audio', new Blob([new Uint8Array(2048)], { type: 'audio/webm' }), 'voice.webm');
        const transcription = await fetch(`${base}/api/groq/transcribe`, { method: 'POST', body: form });
        assert.equal(transcription.status, 200);
        assert.equal((await transcription.json()).text, 'رصيد الخزنة كام؟');
        assert.equal(upstreamAuth, `Bearer ${fakeKey}`);
        assert.match(upstreamPath, /\/audio\/transcriptions$/);

        const speech = await fetch(`${base}/api/groq/speak`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'speak', text: 'أ/سمير الشافعي: الخزنة 100 جنيه' })
        });
        assert.equal(speech.status, 200);
        assert.equal(speech.headers.get('content-type'), 'audio/wav');
        assert.equal((await speech.arrayBuffer()).byteLength, 128);
        assert.equal(upstreamAuth, `Bearer ${fakeKey}`);
        assert.match(upstreamPath, /\/audio\/speech$/);
        assert.equal(upstreamBody.model, 'canopylabs/orpheus-arabic-saudi');
        assert.equal(upstreamBody.voice, 'abdullah');
        assert.equal(upstreamBody.input, 'أستاذ سمير الشافعي: الخزنة 100 جنيه');
        assert.equal(upstreamBody.response_format, 'wav');
        assert.doesNotMatch(Buffer.from(upstreamBody.input).toString('utf8'), /gsk_/);

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
