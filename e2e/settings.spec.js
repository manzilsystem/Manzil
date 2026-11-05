const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

const SECTIONS = [
    ['building', 'بيانات العمارة'],
    ['payments', 'طرق التحصيل'],
    ['subscriptions', 'الاشتراكات'],
    ['appearance', 'المظهر والثيمات'],
    ['backup', 'النسخ الاحتياطي'],
    ['receipts', 'الإيصالات'],
    ['reminders', 'التذكيرات'],
    ['account', 'الحساب والصلاحيات']
];

async function openSettings(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.openSettingsModal === 'function' && typeof window.openModal === 'function');
    await page.evaluate(() => {
        // The backup panel calls the Edge Function; keep the browser test offline.
        window.callBackupConsole = async () => ({ backups: [], restoreRequests: [], backupRequests: [] });
        window.currentUserRole = 'manager';
        window.openSettingsModal();
    });
    await expect(page.locator('#settingsModal')).toBeVisible();
}

test('all eight settings sections open for a manager', async ({ page }) => {
    await openSettings(page);

    await expect(page.locator('.settings-card')).toHaveCount(8);
    for (const [tab, title] of SECTIONS) {
        await page.locator(`#settings-tab-${tab}`).click();
        await expect(page.locator(`#settings-panel-${tab}`)).toBeVisible();
        await expect(page.locator('#settingsCurrentSectionTitle')).toHaveText(title);
        await expect(page.locator('[data-settings-view]')).toHaveAttribute('data-settings-view', 'section');

        await page.locator('.settings-back-button').click();
        await expect(page.locator('#settingsOverview')).toBeVisible();
    }
});

test('settings stay inside the viewport and keep their sections usable', async ({ page }) => {
    await openSettings(page);

    const metrics = await page.evaluate(() => {
        const modal = document.getElementById('settingsModal').getBoundingClientRect();
        return {
            modalLeft: modal.left,
            modalRight: modal.right,
            viewport: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth
        };
    });

    expect(metrics.modalLeft).toBeGreaterThanOrEqual(-1);
    expect(metrics.modalRight).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
});

test('backup administration shows the checksum and requires typed restore confirmation', async ({ page }) => {
    await openSettings(page);
    const tag = 'backup-20261105T022300Z';
    const sha = 'a'.repeat(64);
    await page.evaluate(({ tag, sha }) => {
        window.callBackupConsole = async () => ({
            backups: [{ tag, file_name: `manzil-db-${tag.slice(7)}.dump`, size_bytes: 2048, sha256: sha, created_at: '2026-11-05T02:23:00Z' }],
            restoreRequests: [], backupRequests: [], canDownload: true, canRestore: true
        });
        closeModal('settingsModal');
        openModal('backupModal');
    }, { tag, sha });

    await expect(page.locator('#backupSelectedDetails')).toBeVisible();
    await expect(page.locator('#backupDetailSha')).toHaveText(sha);
    await expect(page.locator('#backupDetailTag')).toHaveText(tag);
    await expect(page.locator('#backupRestoreButton')).toBeEnabled();

    await page.locator('#backupRestoreButton').click();
    await expect(page.locator('#restoreConfirmModal')).toBeVisible();
    await expect(page.locator('#restoreConfirmSubmitButton')).toBeDisabled();
    await page.locator('#restoreConfirmInput').fill('RESTORE');
    await expect(page.locator('#restoreConfirmSubmitButton')).toBeEnabled();
    await page.locator('#restoreConfirmModal').getByRole('button', { name: 'إلغاء', exact: true }).click();
    await expect(page.locator('#restoreConfirmModal')).toBeHidden();
    await expect(page.locator('#backupModal')).toBeVisible();
});
