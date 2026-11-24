const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
assert.ok(meta, 'index.html must define a Content-Security-Policy meta tag');

const directives = new Map(
    meta[1].split(';')
        .map(part => part.trim().split(/\s+/))
        .filter(parts => parts[0])
        .map(parts => [parts[0], parts.slice(1)])
);

const tokens = name => directives.get(name) || [];

test('CSP is declared before any script or stylesheet is loaded', () => {
    const cspIndex = html.indexOf('Content-Security-Policy');
    assert.ok(cspIndex > -1);
    assert.ok(cspIndex < html.indexOf('<script'), 'CSP must precede the first script');
    assert.ok(cspIndex < html.indexOf('<link rel="stylesheet"'), 'CSP must precede the first stylesheet');
});

test('CSP blocks plugins, framing, base hijacking and cross-origin forms', () => {
    assert.deepEqual(tokens('default-src'), ["'self'"]);
    assert.deepEqual(tokens('object-src'), ["'none'"]);
    assert.deepEqual(tokens('frame-src'), ["'none'"]);
    assert.deepEqual(tokens('base-uri'), ["'self'"]);
    assert.deepEqual(tokens('form-action'), ["'self'"]);
    assert.deepEqual(tokens('worker-src'), ["'self'"]);
});

test('CSP allows only the CDNs and Supabase origins the app actually uses', () => {
    // Tailwind CDN removed - now using local build via PostCSS
    assert.ok(tokens('script-src').includes('https://cdn.jsdelivr.net'));
    // Google Fonts CDN removed - using fallback fonts with Cairo
    assert.ok(tokens('style-src').includes('https://cdnjs.cloudflare.com'));
    // Font CDN removed - using local font loading with fallback
    assert.ok(tokens('font-src').includes('https://cdnjs.cloudflare.com'));
    assert.ok(tokens('connect-src').includes('https://musvcrkljccubwbcrtjs.supabase.co'));
    assert.ok(tokens('connect-src').includes('wss://musvcrkljccubwbcrtjs.supabase.co'));
    assert.ok(!tokens('connect-src').includes('https://raw.githubusercontent.com'));
    assert.ok(!tokens('connect-src').includes('https://huggingface.co'));
});

test('connect-src is restricted to same-origin and the configured Supabase project', () => {
    const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
    const configured = /const SUPABASE_URL = '([^']+)'/.exec(supabaseSource);
    assert.ok(configured, 'the Supabase project URL must be declared in js/supabase.js');
    const httpsOrigin = new URL(configured[1]).origin;
    const wssOrigin = httpsOrigin.replace(/^https:/, 'wss:');
    assert.deepEqual([...tokens('connect-src')].sort(), ["'self'", httpsOrigin, wssOrigin].sort());
});

test('CSP never falls back to a wildcard for scripts, styles or connections', () => {
    for (const name of ['script-src', 'style-src', 'default-src']) {
        assert.ok(!tokens(name).some(token => token.includes('*')), `${name} must not use a wildcard`);
    }
    // The assistant uses only same-origin app assets and the configured Supabase endpoints.
    const wildcards = tokens('connect-src').filter(token => token.includes('*'));
    assert.deepEqual(wildcards, []);
});

test('every external stylesheet and script host is permitted by the CSP', () => {
    const tags = [...html.matchAll(/<(?:link|script)\b[^>]*>/g)].map(match => match[0]);
    const hosts = tags
        .map(tag => tag.match(/(?:src|href)="(https:\/\/[^"]+)"/)?.[1])
        .filter(Boolean)
        .map(url => new URL(url).origin);
    assert.ok(hosts.length >= 3);
    for (const origin of hosts) {
        const allowed = [...tokens('style-src'), ...tokens('font-src'), ...tokens('script-src')];
        assert.ok(allowed.includes(origin), `${origin} must be allowlisted`);
    }
});
