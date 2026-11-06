const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const state = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const auditSection = html.slice(html.indexOf('id="auditLogContainer"') - 600, html.indexOf('id="auditLogContainer"') + 150);

test('audit history is clearly described and has no misleading clear action', () => {
    assert.match(auditSection, /سجل العمليات/);
    assert.match(auditSection, /يُحفظ تلقائيًا للمراجعة، ولا يمكن مسحه من التطبيق/);
    assert.doesNotMatch(auditSection, /clearAuditLog|مسح السجل/);
});

test('audit history keeps the existing bounded retention behavior', () => {
    assert.match(state, /if \(state\.auditLogs\.length > 200\) state\.auditLogs = state\.auditLogs\.slice\(0, 200\)/);
    assert.match(state, /سجل التدقيق محفوظ للمراجعة ولا يمكن مسحه/);
});

test('service worker cache is refreshed for the updated audit section', () => {
    assert.match(sw, /CACHE_NAME = 'manzil-v147'/);
});
