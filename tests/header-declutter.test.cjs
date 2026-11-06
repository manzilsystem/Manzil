const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('backup is available in settings without a duplicate header shortcut', () => {
    assert.match(html, /id="settings-tab-backup"[^>]*onclick="switchSettingsTab\('backup'\)"/);
    assert.match(html, /id="settings-panel-backup"/);
    assert.doesNotMatch(html, /aria-label="فتح النسخ الاحتياطي"/);
    assert.match(serviceWorker, /const CACHE_NAME = 'manzil-v135';/);
});

test('header keeps the assistant, settings and session controls only', () => {
    assert.doesNotMatch(html, /aria-label="فتح دليل الاستخدام"/);
    assert.doesNotMatch(html, /aria-label="طباعة التقرير"/);
    assert.match(html, /aria-label="اسأل عم عبده البواب"[^>]*class="[^"]*assistant-header-button/);
    assert.match(html, /class="settings-card"[^>]*onclick="openModal\('guideModal'\)"/);
    assert.match(html, /id="settingsBrandPreviewTitle">الشعار والأيقونة</);
    assert.doesNotMatch(html, /هوية منزل/);
});
