import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

// Local development bridge only. The Groq key never leaves this process and is
// never embedded in index.html, the service worker or any browser-visible file.
// The browser talks to the same-origin /api/groq/* routes so the existing CSP
// (connect-src 'self') stays untouched.

const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.GROQ_DEV_PORT || 8787);
const apiBase = String(process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const defaultModel = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const allowedModels = new Set([
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    defaultModel
]);
const maxRequestBytes = 16 * 1024;
const maxAnswerChars = 6000;

const staticTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json'
};

function loadLocalEnv() {
    // project .env wins; the workspace-root .env is a convenient fallback.
    const candidates = [path.join(root, '.env'), path.resolve(root, '..', '.env')];
    for (const file of candidates) {
        if (!fs.existsSync(file)) continue;
        const text = fs.readFileSync(file, 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
            if (!match || process.env[match[1]] !== undefined) continue;
            const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
            process.env[match[1]] = value;
        }
    }
}

function sendJson(response, status, payload) {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(JSON.stringify(payload));
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on('data', chunk => {
            size += chunk.length;
            if (size > maxRequestBytes) {
                reject(new Error('too_large'));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', reject);
    });
}

function validateChatRequest(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 8) return null;
    const clean = messages.map(message => {
        if (!message || typeof message !== 'object') return null;
        const role = message.role;
        const content = message.content;
        if (!['system', 'user', 'assistant'].includes(role)) return null;
        if (typeof content !== 'string' || !content.trim() || content.length > 6000) return null;
        return { role, content: content.slice(0, 6000) };
    });
    if (clean.some(message => !message)) return null;
    const temperature = Number.isFinite(Number(body.temperature))
        ? Math.min(1, Math.max(0, Number(body.temperature))) : 0.2;
    const maxTokens = Number.isFinite(Number(body.max_tokens))
        ? Math.min(700, Math.max(64, Math.floor(Number(body.max_tokens)))) : 500;
    return { messages: clean, temperature, max_tokens: maxTokens };
}

async function handleChat(request, response) {
    const apiKey = process.env.GROQ_API_KEY || '';
    if (!apiKey) {
        sendJson(response, 503, { error: 'groq_not_configured' });
        return;
    }
    let payload;
    try {
        payload = validateChatRequest(JSON.parse(await readBody(request)));
    } catch (error) {
        sendJson(response, 400, { error: error?.message === 'too_large' ? 'request_too_large' : 'invalid_request' });
        return;
    }
    if (!payload) {
        sendJson(response, 400, { error: 'invalid_request' });
        return;
    }

    try {
        const upstream = await fetch(`${apiBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: defaultModel,
                messages: payload.messages,
                temperature: payload.temperature,
                max_tokens: payload.max_tokens,
                stream: false
            }),
            signal: AbortSignal.timeout(20000)
        });
        if (!upstream.ok) {
            // Never forward the upstream body: it may echo request content.
            sendJson(response, 502, { error: 'groq_upstream_failed', status: upstream.status });
            return;
        }
        const data = await upstream.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            sendJson(response, 502, { error: 'groq_empty_answer' });
            return;
        }
        sendJson(response, 200, { content: content.slice(0, maxAnswerChars), model: defaultModel });
    } catch (error) {
        const reason = error?.name === 'TimeoutError' ? 'groq_timeout' : 'groq_unreachable';
        sendJson(response, 502, { error: reason });
    }
}

function serveStatic(pathname, response) {
    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = path.resolve(root, `.${relative}`);
    if (file !== root && !file.startsWith(root + path.sep)) {
        response.writeHead(403);
        response.end('forbidden');
        return;
    }
    if (file.split(path.sep).some(part => part.startsWith('.'))) {
        response.writeHead(403);
        response.end('forbidden');
        return;
    }
    fs.readFile(file, (error, data) => {
        if (error) {
            response.writeHead(404);
            response.end('not found');
            return;
        }
        response.writeHead(200, {
            'Content-Type': staticTypes[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        response.end(data);
    });
}

loadLocalEnv();

const server = http.createServer((request, response) => {
    let pathname;
    try {
        pathname = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
    } catch {
        sendJson(response, 400, { error: 'bad_request' });
        return;
    }
    if (pathname === '/api/groq/health' && request.method === 'GET') {
        sendJson(response, 200, { enabled: Boolean(process.env.GROQ_API_KEY), model: defaultModel });
        return;
    }
    if (pathname === '/api/groq/chat' && request.method === 'POST') {
        void handleChat(request, response);
        return;
    }
    if (pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: 'not_found' });
        return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405);
        response.end('method not allowed');
        return;
    }
    serveStatic(pathname, response);
});

server.listen(port, '127.0.0.1', () => {
    const state = process.env.GROQ_API_KEY ? 'key configured' : 'GROQ_API_KEY missing — assistant stays local';
    console.log(`Manzil + Groq dev server: http://127.0.0.1:${port}/ (${state})`);
});

export { server, validateChatRequest };
