const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backupUi = fs.readFileSync(path.join(__dirname, '..', 'js/backup.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('cached backup console data never enables backup or restore actions', () => {
    assert.match(backupUi, /const restoreAllowed = !cached && data\.canRestore !== false/);
    assert.match(backupUi, /restoreButton\.disabled = !restoreAllowed \|\| !backups\.length \|\| restorePending \|\| backupPending/);
    assert.match(backupUi, /createButton\.disabled = cached \|\| backupPending \|\| restorePending/);
});

test('backup console explains stale local data instead of silently showing it', () => {
    assert.match(html, /id="backupStaleNotice"/);
    assert.match(backupUi, /staleNotice\.classList\.toggle\('hidden', !cached\)/);
    assert.match(html, /لا يمكن إنشاء نسخة أو استعادة حتى يتم التحقق من الحالة من الخادم/);
});

test('selected backup details expose the checksum and restore history', () => {
    assert.match(html, /id="backupDetailSha"/);
    assert.match(html, /id="backupDetailRestored"/);
    assert.match(backupUi, /formatBackupSha\(backup\.sha256\)/);
    assert.match(backupUi, /item\.backup_tag === backup\.tag && item\.status === 'succeeded'/);
});

test('JSON export carries versioned metadata and import still accepts older plain files', () => {
    assert.match(backupUi, /format: 'manzil-state-json'/);
    assert.match(backupUi, /exportedAt: exportedAt\.toISOString\(\)/);
    assert.match(backupUi, /counts: \{/);
    assert.match(backupUi, /raw\.format === 'manzil-state-json' \? raw\.data : raw/);
    assert.match(html, /لا يستبدل قاعدة البيانات الكاملة/);
});

test('backup actions remain disabled until a fresh server response is received', () => {
    assert.match(backupUi, /if \(restoreButton\) restoreButton\.disabled = true/);
    assert.match(backupUi, /if \(createButton\) createButton\.disabled = true/);
    assert.match(backupUi, /renderBackupConsole\(data, false\)/);
});

test('backup console exposes manual refresh and reports stale-cache/network failures', () => {
    assert.match(html, /onclick="loadBackupConsole\(\)"/);
    assert.match(html, /id="backupRefreshNotice"/);
    assert.match(backupUi, /المعروض سجل محفوظ محليًا وقد لا يعكس الحالة الحالية/);
    assert.match(backupUi, /فشل الاتصال بالخادم/);
});

test('backup console prevents overlapping list requests and retries failed refreshes', () => {
    assert.match(backupUi, /if \(backupConsoleLoadPromise\) return backupConsoleLoadPromise/);
    assert.match(backupUi, /scheduleBackupConsoleRefresh\(true\)/);
});


test('restore session refresh is required after successful database replacement', () => {
    assert.match(backupUi, /lockCurrentSession/);
    assert.match(backupUi, /اكتملت استعادة قاعدة البيانات/);
});


test('restore request tracking survives cached renders until a fresh terminal result arrives', () => {
    assert.match(backupUi, /if \(pendingRestore\?\.id\) activeRestoreRequestId = pendingRestore\.id/);
    assert.match(backupUi, /else if \(!cached\) activeRestoreRequestId = null/);
    assert.match(backupUi, /const trackedRestoreRequestId = activeRestoreRequestId/);
    assert.match(backupUi, /find\(item => item\.id === trackedRestoreRequestId\)/);
});


test('uncertain restore outcome after worker interruption forces a fresh authenticated session', () => {
    assert.match(backupUi, /const uncertainRestore = trackedRestore\?\.status === 'failed'/);
    assert.match(backupUi, /RESTORE_OUTCOME_UNCERTAIN/);
    assert.match(backupUi, /تعذر تأكيد نتيجة الاستعادة بعد انقطاع المهمة/);
    assert.match(backupUi, /if \(\(completedRestore \|\| uncertainRestore\) && typeof lockCurrentSession === 'function'\)/);
});


test('backup schedule copy matches the UTC workflow and Cairo seasonal time', () => {
    assert.match(html, /موعد النسخ اليومي 02:23 UTC \(04:23 شتاءً و05:23 صيفًا بتوقيت القاهرة\)/);
    assert.doesNotMatch(html, /نسخة يومية 04:23 صباحًا بتوقيت مصر/);
});

test('backup modal separates protection, creation, restore and JSON actions into ordered cards', () => {
    const modal = html.slice(html.indexOf('id="backupModal"'), html.indexOf('id="restoreConfirmModal"'));
    const titles = ['حماية البيانات', 'إنشاء نسخة احتياطية', 'استعادة قاعدة البيانات', 'نسخة التطبيق المحلية (JSON)'];
    const positions = titles.map(title => modal.indexOf(title));
    positions.forEach((position, index) => assert.ok(position > -1, `missing backup card: ${titles[index]}`));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'backup cards must appear in order');
    // Each action owns its own status region inside its card; creation must not
    // share the destructive restore card's status.
    const [protectionStart, createStart, restoreStart] = positions;
    const between = (id, from, to) => {
        const at = modal.indexOf(`id="${id}"`);
        return at > from && at < to;
    };
    assert.equal((modal.match(/<section/g) || []).length, 4, 'the backup modal must expose exactly four cards');
    assert.ok(between('backupCreateButton', createStart, restoreStart) && between('backupCreateStatus', createStart, restoreStart),
        'manual creation button and status live in their own card');
    assert.ok(modal.indexOf('id="backupRestoreButton"') > restoreStart && modal.indexOf('id="backupRestoreStatus"') > restoreStart,
        'restore button and status live in the restore card');
    assert.ok(protectionStart < createStart, 'the protection card comes first');
});
