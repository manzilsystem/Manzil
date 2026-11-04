const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const settings = fs.readFileSync(path.join(__dirname, '..', 'js/settings.js'), 'utf8');

function runSummary(response) {
    const elements = {
        settingsBackupSummaryText: { textContent: '' },
        settingsBackupSummaryMeta: { textContent: '' }
    };
    const sandbox = {
        document: { getElementById: id => elements[id] || null },
        requireManager: () => true,
        callBackupConsole: async () => {
            if (response instanceof Error) throw response;
            return response;
        },
        console: { error() {} }
    };
    const api = vm.runInNewContext(settings + '\n({ loadSettingsBackupSummary })', sandbox);
    return api.loadSettingsBackupSummary().then(() => elements);
}

test('settings backup summary reads the latest backup from the server', async () => {
    const elements = await runSummary({
        backups: [{ created_at: '2026-11-04T10:00:00Z' }],
        restoreRequests: [], backupRequests: [], canDownload: true
    });
    assert.match(elements.settingsBackupSummaryText.textContent, /آخر نسخة ناجحة/);
    assert.match(elements.settingsBackupSummaryMeta.textContent, /1 نسخة متاحة/);
    assert.match(elements.settingsBackupSummaryMeta.textContent, /التنزيل الكامل متاح/);
});

test('settings backup summary prioritizes a pending restore operation', async () => {
    const elements = await runSummary({
        backups: [{ created_at: '2026-11-04T10:00:00Z' }],
        restoreRequests: [{ status: 'running' }], backupRequests: [], canDownload: false
    });
    assert.match(elements.settingsBackupSummaryText.textContent, /استعادة قيد التنفيذ/);
});

test('settings backup summary never presents stale data when the server request fails', async () => {
    const elements = await runSummary(new Error('network unavailable'));
    assert.match(elements.settingsBackupSummaryText.textContent, /تعذر جلب حالة النسخ/);
    assert.match(elements.settingsBackupSummaryMeta.textContent, /لم يتم الاعتماد على بيانات محلية قديمة/);
});
