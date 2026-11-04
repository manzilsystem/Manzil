const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const settings = read('js/settings.js');
const auth = read('js/supabase.js');
const render = read('js/render.js');
const access = read('js/access.js');
const provision = read('supabase/functions/manage-owner-access/index.ts');
const css = read('css/style.css');
const sw = read('sw.js');

test('manager settings expose owner account provisioning without granting owner write access', () => {
    assert.match(html, /إدارة حسابات الملاك/);
    assert.match(html, /صلاحية المالك تظل للعرض فقط/);
    assert.match(settings, /function renderSettingsOwnerAccess\(\)/);
    assert.match(settings, /provisionOwnerAccess\('\$\{esc\(resident\.id\)\}'\)/);
    assert.match(settings, /editResident\('\$\{esc\(resident\.id\)\}'\)/);
    assert.match(access, /function requireManager\(/);
    assert.match(provision, /role.*manager/);
    assert.match(auth, /: 'id,name,apartment_number,floor,monthly_amount,created_at'/);
});

test('audit log attributes actions to profile names and supports safe client-side search', () => {
    assert.match(auth, /actor:profiles!audit_logs_actor_id_fkey\(full_name\)/);
    assert.match(auth, /actorName: row\.actor\?\.full_name/);
    assert.match(render, /auditLogSearch/);
    assert.match(render, /entry\.actorName/);
    assert.match(render, /esc\(entry\.actorName \|\| 'المدير'\)/);
    assert.match(html, /id="auditLogSearch"[^>]*oninput="renderAuditLog\(\)"/);
    assert.match(html, /id="auditLogContainer"[^>]*aria-live="polite"/);
});

test('owner account controls are touch-friendly and service worker cache is refreshed', () => {
    assert.match(css, /\.settings-owner-action \{ min-height:40px/);
    assert.match(css, /@media\(max-width:420px\)[\s\S]*\.settings-owner-row/);
    assert.match(sw, /CACHE_NAME = 'manzil-v77'/);
});
