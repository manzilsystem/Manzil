const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function seedAndOpenAssistant(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.openAssistantModal === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        const now = new Date();
        const currentMonth = `${monthsNames[now.getMonth()]} ${now.getFullYear()}`;
        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const previousMonth = `${monthsNames[previous.getMonth()]} ${previous.getFullYear()}`;
        const currentStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const previousStart = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-01`;
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        state.cashAccountBalances = { main: 1200, development: 300, emergency: 50 };
        state.residents = [
            { id: 'r1', name: 'أحمد علي', apartmentNumber: '3', monthlyAmount: 100, billingStartMonth: currentStart, createdAt: `${currentStart}T00:00:00.000Z` },
            { id: 'r2', name: 'سارة حسن', apartmentNumber: '7', monthlyAmount: 200, billingStartMonth: previousStart, createdAt: `${previousStart}T00:00:00.000Z` }
        ];
        state.income = [
            { id: 'i1', residentId: 'r1', month: currentMonth, amount: 100, purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'cash', date: new Date().toISOString() },
            { id: 'i2', residentId: 'r2', month: currentMonth, amount: 50, purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'cash', date: new Date().toISOString() }
        ];
        state.expenses = [
            { id: 'e1', month: currentMonth, title: 'نظافة', amount: 60, category: 'نظافة', cashAccountCode: 'main', date: new Date().toISOString() },
            { id: 'e2', month: currentMonth, title: 'كهرباء', amount: 40, category: 'كهرباء', cashAccountCode: 'main', date: new Date().toISOString() }
        ];
        state.adjustments = [];
        renderAll();
    });
    await page.locator('#assistantFab').click();
    await expect(page.locator('#assistantModal')).toBeVisible();
    await expect(page.locator('#assistantLog')).toContainText('عم عبده البواب');
}

test('assistant opens from the launcher and answers local questions', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const botMessages = page.locator('#assistantLog .assistant-msg.is-bot .assistant-bubble');
    await expect(botMessages.first()).toContainText('أهلاً يا أستاذ');

    await page.locator('[data-assistant-query="رصيد الخزنة كام؟"]').click();
    await expect(botMessages.last()).toContainText('الخزنة الرئيسية');
    await expect(botMessages.last()).toContainText('1,550 ج.م');

    await page.locator('#assistantInput').fill('ملخص الشهر');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog .assistant-msg.is-user').last()).toContainText('ملخص الشهر');
    await expect(botMessages.last()).toContainText('التحصيل المسجل');
    await expect(botMessages.last()).toContainText('150 ج.م');
    await expect(botMessages.last()).toContainText('سارة حسن');

    await page.locator('#assistantInput').fill('شقة 3 دفع كام؟');
    await page.locator('#assistantInput').press('Enter');
    await expect(botMessages.last()).toContainText('أحمد علي');
    await expect(botMessages.last()).toContainText('100 ج.م');
    await expect(botMessages.last()).toContainText('0 ج.م');

    await page.locator('#assistantInput').fill('مصروفات الشهر');
    await page.locator('#assistantInput').press('Enter');
    await expect(botMessages.last()).toContainText('إجمالي المصروفات');
    await expect(botMessages.last()).toContainText('نظافة');
});

test('assistant reset, escape close, and launcher restore behave', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const modal = page.locator('#assistantModal');

    await page.getByRole('button', { name: 'بدء محادثة جديدة' }).click();
    await expect(page.locator('#assistantLog .assistant-msg')).toHaveCount(1);
    await expect(page.locator('#assistantLog')).toContainText('أهلاً يا أستاذ');

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    await page.locator('#assistantFab').click();
    await expect(modal).toBeVisible();
    await expect(page.locator('#assistantLog .assistant-msg')).toHaveCount(1);
});

test.describe('assistant floating launcher', () => {
    test.beforeEach(async ({ page }) => {
        await loadShell(page);
        await page.waitForFunction(() => typeof window.syncAssistantFab === 'function' && typeof renderAll === 'function');
        await page.evaluate(() => {
            window.currentUserRole = 'manager';
            document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
            document.getElementById('pinLockModal').classList.add('hidden');
            state.buildingName = 'عمارة الاختبار';
            state.residents = Array.from({ length: 60 }, (_, i) => ({
                id: `r${i}`,
                name: `ساكن ${i + 1}`,
                apartmentNumber: String(i + 1),
                monthlyAmount: 100,
                billingStartMonth: '2026-11-01',
                createdAt: '2026-11-01T00:00:00.000Z'
            }));
            state.income = [];
            state.expenses = [];
            state.adjustments = [];
            renderAll();
            switchTab('residents');
        });
    });

    test('clears the bottom nav, shrinks on scroll down and widens on scroll up', async ({ page }) => {
        const fab = page.locator('#assistantFab');
        await expect(fab).toBeVisible();
        await expect(fab.locator('.assistant-fab-avatar img')).toHaveAttribute('src', 'icons/assistant-abbah.png');
        await expect(fab).not.toHaveClass(/is-hidden|is-compact/);

        const box = await fab.boundingBox();
        const navBox = await page.locator('nav[aria-label="التنقل الرئيسي"]').boundingBox();
        expect(box.y + box.height).toBeLessThanOrEqual(navBox.y + 1);

        const scrollRoom = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
        expect(scrollRoom).toBeGreaterThan(400);

        await page.mouse.wheel(0, 500);
        await expect(fab).toHaveClass(/is-compact/);
        await expect(fab).not.toHaveClass(/is-hidden/);
        await expect(fab).toBeVisible();
        const compactBox = await fab.boundingBox();
        if (page.viewportSize().width > 560) {
            await expect.poll(async () => (await fab.boundingBox()).width, { timeout: 5_000 })
                .toBeLessThan(box.width - 20);
        }
        expect(compactBox.height).toBeGreaterThan(40);

        await page.mouse.wheel(0, -300);
        await expect(fab).not.toHaveClass(/is-compact/);
        await expect(fab).toBeVisible();
    });

    test('stays out of the way while the assistant modal is open', async ({ page }) => {
        const fab = page.locator('#assistantFab');
        await fab.click();
        await expect(page.locator('#assistantModal')).toBeVisible();
        await expect(fab).toHaveClass(/is-hidden/);

        await page.keyboard.press('Escape');
        await expect(page.locator('#assistantModal')).toBeHidden();
        await expect(fab).not.toHaveClass(/is-hidden/);
    });

    test('disappears for the owner portal and locked sessions', async ({ page }) => {
        const fab = page.locator('#assistantFab');
        await page.evaluate(() => document.body.classList.add('owner-mode'));
        await expect(fab).toBeHidden();

        await page.evaluate(() => {
            document.body.classList.remove('owner-mode');
            document.body.classList.add('session-locked');
            window.syncAssistantFab();
        });
        await expect(fab).toBeHidden();
    });
});

test.describe('assistant remembers the conversation', () => {
    test('follow-up chips continue in the month already on screen', async ({ page }) => {
        await seedAndOpenAssistant(page);
        const botMessages = page.locator('#assistantLog .assistant-msg.is-bot:not(.is-typing) .assistant-bubble');

        await page.locator('#assistantInput').fill('تحصيل أكتوبر 2026');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('تحصيل أكتوبر 2026');
        await expect(page.locator('#assistantLog .is-typing')).toHaveCount(0);

        const chip = page.locator('#assistantLog [data-assistant-query="مصروفات أكتوبر 2026"]');
        await expect(chip).toBeVisible();
        await chip.click();
        await expect(botMessages.last()).toContainText('مصروفات أكتوبر 2026');
    });

    test('a pronoun keeps the answer on the apartment just discussed', async ({ page }) => {
        await seedAndOpenAssistant(page);
        const botMessages = page.locator('#assistantLog .assistant-msg.is-bot:not(.is-typing) .assistant-bubble');

        await page.locator('#assistantInput').fill('شقة 7 دفع كام؟');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('سارة حسن');

        await page.locator('#assistantInput').fill('هو دفع كام؟');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('سارة حسن');
        await expect(botMessages.last()).not.toContainText('أحمد علي');
    });

    test('the chat survives closing the assistant and resets on demand', async ({ page }) => {
        await seedAndOpenAssistant(page);
        const messages = page.locator('#assistantLog .assistant-msg:not(.is-typing)');

        await page.locator('#assistantInput').fill('رصيد الخزنة كام؟');
        await page.locator('#assistantInput').press('Enter');
        await expect(messages).toHaveCount(3);

        await page.keyboard.press('Escape');
        await page.locator('#assistantFab').click();
        await expect(page.locator('#assistantModal')).toBeVisible();
        await expect(messages).toHaveCount(3);
        await expect(page.locator('#assistantLog .assistant-msg.is-user').last()).toContainText('رصيد الخزنة كام؟');

        await page.getByRole('button', { name: 'بدء محادثة جديدة' }).click();
        await expect(messages).toHaveCount(1);
        await expect(page.locator('#assistantLog')).toContainText('أهلاً يا أستاذ');
    });
});
