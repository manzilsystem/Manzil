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
    await page.locator('.assistant-header-button').click();
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

    await page.locator('.assistant-header-button').click();
    await expect(modal).toBeVisible();
    await expect(page.locator('#assistantLog .assistant-msg')).toHaveCount(1);
});
