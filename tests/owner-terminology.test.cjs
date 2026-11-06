const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const interfaceFiles = [
    'index.html',
    'src/partials/main-tabs.html',
    'src/partials/modals.html',
    'js/render.js',
    'js/reports.js',
    'js/notices.js',
    'js/crud.js'
];

test('Arabic interface uses owner terminology consistently', () => {
    for (const file of interfaceFiles) {
        assert.doesNotMatch(read(file), /ساكن|سكان/, file + ' must not expose resident terminology');
    }

    const html = read('index.html');
    assert.match(html, /اسم المالك/);
    assert.match(html, /بيانات المالك/);
    assert.match(html, /اختر المالك/);
    assert.match(html, /كشف حساب مالك/);
    assert.match(html, /متأخرات الملاك/);
    assert.doesNotMatch(html, /اسم المالك أو المالك/);
});

test('assistant keeps legacy resident wording as input synonyms, not output labels', () => {
    const assistant = read('js/assistant.js');
    assert.match(assistant, /normalized\.match\(\/\(\?:شقه\|وحده\|ساكن\|رقم\)/);
    const legacyLines = assistant.match(/^.*(?:ساكن|سكان).*$/gm) || [];
    const nonParserLines = legacyLines.filter(line => !line.includes('normalized.match(/(?:شقه|وحده|ساكن|رقم)/')
        && !line.includes("return 'building';")
        && !line.includes("return 'owner_scope';"));
    assert.deepEqual(nonParserLines, []);
    assert.match(assistant, /مالك محذوف/);
});
