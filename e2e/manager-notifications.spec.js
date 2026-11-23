const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function seedNotifications(page, readAt) {
    await loadShell(page);
    await page.waitForFunction(() => typeof renderManagerNotifications === 'function');
    await page.evaluate(shouldRead => {
        currentUserRole = 'manager';
        activeSession = { user: { id: 'manager-test' } };
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.managerNotifications = [
            { id: 'n1', title: 'مصروف جديد', body: 'تم تعديل مصروف', createdAt: new Date().toISOString(), readAt: shouldRead ? new Date().toISOString() : null }
        ];
        renderManagerNotifications();
    }, readAt);
}

test('the manager bell exposes its unread count in the accessible name', async ({ page }) => {
    await seedNotifications(page, false);

    await expect(page.locator('#managerNotificationsBadge')).toHaveText('1');
    await expect(page.locator('#managerNotificationsBtn'))
        .toHaveAttribute('aria-label', /إشعارات المدير.*1/);
    await expect(page.getByRole('button', { name: /إشعارات المدير.*1/ })).toHaveCount(1);

    await page.evaluate(() => {
        state.managerNotifications[0].readAt = new Date().toISOString();
        renderManagerNotifications();
    });
    await expect(page.locator('#managerNotificationsBadge')).toBeHidden();
    await expect(page.locator('#managerNotificationsBtn'))
        .toHaveAttribute('aria-label', 'إشعارات المدير');
});
