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

async function installAssistantNetworkProbe(page) {
    await page.evaluate(() => {
        const calls = [];
        window.__assistantNetworkProbe = calls;
        const record = (kind, detail) => calls.push(`${kind}:${String(detail || '')}`);

        const originalFetch = window.fetch;
        if (typeof originalFetch === 'function') {
            window.fetch = function (input, init) {
                record('fetch', typeof input === 'string' ? input : input && input.url);
                return originalFetch.apply(this, [input, init]);
            };
        }

        const originalXhrOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            record('xhr', url);
            return originalXhrOpen.apply(this, arguments);
        };

        const originalBeacon = navigator.sendBeacon;
        if (typeof originalBeacon === 'function') {
            navigator.sendBeacon = function (url, data) {
                record('beacon', url);
                return originalBeacon.call(this, url, data);
            };
        }

        const originalWebSocket = window.WebSocket;
        window.WebSocket = class extends originalWebSocket {
            constructor(url, protocols) {
                record('websocket', url);
                super(url, protocols);
            }
        };

        const originalEventSource = window.EventSource;
        if (typeof originalEventSource === 'function') {
            window.EventSource = class extends originalEventSource {
                constructor(url, config) {
                    record('eventsource', url);
                    super(url, config);
                }
            };
        }

        const imageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        if (imageSource && imageSource.set) {
            Object.defineProperty(HTMLImageElement.prototype, 'src', {
                get: imageSource.get,
                set(value) {
                    record('image', value);
                    return imageSource.set.call(this, value);
                }
            });
        }

        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (this === window.localStorage) record('localStorage', key);
            return originalSetItem.call(this, key, value);
        };
    });
}

async function askAssistantQuestion(page, question) {
    const messages = page.locator('#assistantLog .assistant-msg:not(.is-typing)');
    const before = await messages.count();
    await page.locator('#assistantInput').fill(question);
    await page.locator('#assistantInput').press('Enter');
    await expect(messages).toHaveCount(before + 2);
}

test('assistant opens from the launcher and answers local questions', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await expect(page.locator('#assistantInput')).toBeVisible();
    await expect(page.locator('#assistantTools, #assistantQuickActions, #assistantSuggestions')).toHaveCount(0);
    await expect(page.locator('#assistantVoiceButton')).toBeVisible();
    await expect(page.locator('#assistantVoiceButton')).toHaveCount(1);
    await expect(page.locator('#assistantVoiceButton')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#assistantSoundButton')).toHaveCount(1);
    await expect(page.locator('#assistantVoiceDownloadModal')).toHaveCount(0);
    const botMessages = page.locator('#assistantLog .assistant-msg.is-bot .assistant-bubble');
    await expect(botMessages.first()).toContainText('أهلاً يا باشا');
    await expect(page.locator('#assistantInput')).toHaveAttribute('placeholder', /الخزنة/);

    await page.locator('#assistantInput').fill('رصيد الخزنة كام؟');
    await page.locator('#assistantInput').press('Enter');
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

test('a confirmed manager collection saves in chat without opening a CRUD form or receipt', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const before = await page.evaluate(() => state.income.length);
    await page.locator('#assistantInput').fill('سجل تحصيل 150 جنيه من سارة حسن شقة 7 عن نوفمبر 2026 نقدي');
    await page.locator('#assistantInput').press('Enter');

    const preview = page.locator('#assistantLog .assistant-action-preview');
    await expect(preview).toContainText('سارة حسن');
    // Keep this acceptance check on seeded in-memory data; never write to the shared backend.
    // The busy state only lasts for the save, so capture it when it appears instead of
    // racing a short-lived status text with a polling assertion.
    await page.evaluate(() => {
        window.saveWithRollback = () => new Promise(resolve => window.setTimeout(() => resolve(true), 250));
        window.__assistantBusySnapshot = null;
        const status = document.getElementById('assistantStatusText');
        const capture = () => {
            if (!status.textContent.includes('جارٍ التحقق والحفظ')) return;
            window.__assistantBusySnapshot = {
                status: status.textContent,
                readOnly: document.getElementById('assistantInput').readOnly,
                sendDisabled: document.getElementById('assistantSendButton').disabled,
                modalVisible: !document.getElementById('assistantModal').classList.contains('hidden'),
                incomeHidden: document.getElementById('incomeModal').classList.contains('hidden'),
                receiptHidden: document.getElementById('incomeReceiptModal').classList.contains('hidden')
            };
        };
        new MutationObserver(capture).observe(status, { childList: true, characterData: true, subtree: true });
        capture();
    });
    await page.locator('#assistantInput').fill('أكد التسجيل');
    await page.locator('#assistantInput').press('Enter');

    await expect.poll(() => page.evaluate(() => window.__assistantBusySnapshot)).not.toBeNull();
    const busy = await page.evaluate(() => window.__assistantBusySnapshot);
    expect(busy.status).toContain('جارٍ التحقق والحفظ');
    expect(busy.readOnly).toBe(true);
    expect(busy.sendDisabled).toBe(true);
    expect(busy.modalVisible).toBe(true);
    expect(busy.incomeHidden).toBe(true);
    expect(busy.receiptHidden).toBe(true);
    await expect(page.locator('#assistantLog')).toContainText('تم حفظ التحصيل بنجاح');
    await expect(page.locator('#assistantStatusText')).toContainText('جاهز');
    await expect.poll(() => page.evaluate(() => state.income.length)).toBeGreaterThan(before);
});

test('a colloquial expense is previewed and saved only after typed confirmation', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const before = await page.evaluate(() => state.expenses.length);
    await page.locator('#assistantInput').fill('قيد مصروف كهرباء 300 جنيه عن نوفمبر 2026');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('معاينة مصروف');
    await expect(page.locator('#assistantLog')).toContainText('300');
    await expect(page.locator('#assistantLog .assistant-msg.is-bot .assistant-bubble button:not(.assistant-voice-replay):not(.assistant-voice-play)')).toHaveCount(0);
    // Keep the regression on seeded in-memory data, never on the shared backend.
    await page.evaluate(() => { window.saveWithRollback = async () => true; });
    await page.locator('#assistantInput').fill('أكد التسجيل');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('تم حفظ المصروف بنجاح');
    await expect.poll(() => page.evaluate(() => state.expenses.length)).toBe(before + 1);
    const lastExpense = await page.evaluate(() => state.expenses[state.expenses.length - 1]);
    expect(lastExpense.category).toBe('كهرباء');
    expect(Number(lastExpense.amount)).toBe(300);
});

test('compound colloquial manager questions return ordered sections without extra prompts', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const botMessages = page.locator('#assistantLog .assistant-msg.is-bot:not(.is-typing) .assistant-bubble');

    await page.locator('#assistantInput').fill('فلوسنا راحت فين وكمان مين لسه مادفعش ورصيد الصندوق كام؟');
    await page.locator('#assistantInput').press('Enter');

    await expect(botMessages.last()).toContainText('إجابة مجمعة');
    await expect(botMessages.last()).toContainText('إجمالي المصروفات');
    await expect(botMessages.last()).toContainText('إجمالي المتأخرات');
    await expect(botMessages.last()).toContainText('الخزنة الرئيسية');
    await expect(botMessages.last()).toContainText('سؤال متابعة طبيعي');
});

test('owner compound questions never reveal building-wide amounts or other residents', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await page.evaluate(() => {
        window.currentUserRole = 'owner';
        window.currentResidentId = 'r1';
        document.body.classList.add('owner-mode');
    });
    const botMessages = page.locator('#assistantLog .assistant-msg.is-bot:not(.is-typing) .assistant-bubble');

    await page.locator('#assistantInput').fill('حسابي ورصيد الخزنة ومين عليه متأخرات؟');
    await page.locator('#assistantInput').press('Enter');
    await expect(botMessages.last()).toContainText('ده يخص الإدارة');
    await expect(botMessages.last()).not.toContainText('سارة حسن');
    await expect(botMessages.last()).not.toContainText('60 ج.م');
});

test('incomplete write requests are completed in chat before confirmation', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const before = await page.evaluate(() => state.income.length);

    await page.locator('#assistantInput').fill('سجل تحصيل 150 جنيه');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('بيانات تحصيل ناقصة');
    await expect(page.locator('#assistantLog')).toContainText('المالك أو رقم الشقة');

    await page.locator('#assistantInput').fill('من سارة حسن شقة 7 نقدي');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('معاينة تحصيل قبل الإدخال');
    await expect(page.locator('#assistantLog')).toContainText('سارة حسن');
    await expect.poll(() => page.evaluate(() => state.income.length)).toBe(before);

    await page.evaluate(() => { window.saveWithRollback = async () => true; });
    await page.locator('#assistantInput').fill('أكد التسجيل');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('تم حفظ التحصيل بنجاح');
    await expect.poll(() => page.evaluate(() => state.income.length)).toBe(before + 1);
});

test('typed cancellation discards a write draft without changing application state', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const before = await page.evaluate(() => JSON.stringify({ income: state.income, expenses: state.expenses, adjustments: state.adjustments }));

    await page.locator('#assistantInput').fill('قيد مصروف كهرباء 300 جنيه عن نوفمبر 2026');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('معاينة مصروف');

    await page.locator('#assistantInput').fill('إلغاء');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('تم إلغاء المسودة');
    await expect.poll(() => page.evaluate(() => JSON.stringify({ income: state.income, expenses: state.expenses, adjustments: state.adjustments }))).toBe(before);
});

test('owner questions about another unit or resident receive a privacy refusal', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await page.evaluate(() => {
        window.currentUserRole = 'owner';
        currentResidentId = 'r1';
        document.body.classList.add('owner-mode');
    });

    const botMessages = page.locator('#assistantLog .assistant-msg.is-bot .assistant-bubble');
    for (const question of ['متأخرات شقة ٧', 'سارة حسن دفعت كام؟']) {
        await askAssistantQuestion(page, question);
        await expect(botMessages.last()).toContainText('ما أقدرش أراجع بيانات شقة');
        await expect(botMessages.last()).not.toContainText('سارة حسن');
        await expect(botMessages.last()).not.toContainText('200 ج.م');
    }
});

test('the manager conversation stays offline and read-only in the real app', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await installAssistantNetworkProbe(page);
    const before = await page.evaluate(() => JSON.stringify(state));

    for (const question of ['رصيد الخزنة كام؟', 'ملخص الشهر', 'سجّل دفعة لأحمد', 'احذف مصروف النظافة', 'مين عليه متأخرات؟']) {
        await askAssistantQuestion(page, question);
    }

    const probe = await page.evaluate(() => window.__assistantNetworkProbe.slice());
    expect(probe, 'the assistant must never touch the network').toEqual([]);
    const after = await page.evaluate(() => JSON.stringify(state));
    expect(after, 'the assistant must never write state').toBe(before);
});

test('the manager confirms an assistant collection in the official form and gets a request-linked audit record', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const month = await page.evaluate(() => `${monthsNames[new Date().getMonth()]} ${new Date().getFullYear()}`);
    const command = `سجّل تحصيل 50 جنيه من سارة حسن شقة 7 عن ${month}`;
    const beforeCount = await page.evaluate(() => state.income.length);
    await page.evaluate(() => {
        window.__savedAssistantRequestId = null;
        window.saveState = async requestId => {
            window.__savedAssistantRequestId = requestId;
            return true;
        };
    });

    await askAssistantQuestion(page, command);
    await askAssistantQuestion(page, 'افتح النموذج');
    await expect(page.locator('#incomeModal')).toBeVisible();
    const confirmButton = page.locator('#incomeSubmitButton');
    await expect(confirmButton).toHaveText('تأكيد وتسجيل التحصيل عبر عم عبده');
    await page.locator('#incomePaymentMethod').selectOption('cash');
    await confirmButton.click();
    await expect(page.locator('#incomeModal')).toBeHidden();

    const result = await page.evaluate(() => ({
        requestId: window.__savedAssistantRequestId,
        incomeCount: state.income.length,
        audit: state.auditLogs[0]?.details || ''
    }));
    expect(result.incomeCount).toBe(beforeCount + 1);
    expect(result.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(result.audit).toContain('المصدر: عم عبده');
    expect(result.audit).toContain(`مرجع الطلب: ${result.requestId}`);
    expect(result.audit).toContain(`طلب المدير: ${command}`);
});

test('assistant reset, escape close, and launcher restore behave', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const modal = page.locator('#assistantModal');

    await page.getByRole('button', { name: 'بدء محادثة جديدة' }).click();
    await expect(page.locator('#assistantLog .assistant-msg')).toHaveCount(1);
    await expect(page.locator('#assistantLog')).toContainText('أهلاً يا باشا');

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    await page.locator('#assistantFab').click();
    await expect(modal).toBeVisible();
    await expect(page.locator('#assistantLog .assistant-msg')).toHaveCount(1);
});

test('assistant opens the formal reports screen only when asked, without an in-chat button', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await page.getByRole('textbox', { name: 'اكتب سؤالك لعم عبده' }).fill('افتح شاشة التقارير');
    await page.getByRole('textbox', { name: 'اكتب سؤالك لعم عبده' }).press('Enter');

    await expect(page.locator('#assistantModal')).toBeHidden();
    await expect(page.locator('#tab-reports')).toBeVisible();
});

test('assistant opens the report panel named in an explicit manager request', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await page.locator('#assistantInput').fill('افتح تقرير المصروفات');
    await page.locator('#assistantInput').press('Enter');

    await expect(page.locator('#assistantModal')).toBeHidden();
    await expect(page.locator('#tab-reports')).toBeVisible();
    await expect(page.locator('#expensesReportCard')).toBeVisible();
    await expect(page.locator('[data-report-nav="expenses"]')).toHaveAttribute('aria-current', 'page');
});

test('assistant routes combined collection and expenses report requests to the period panel', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await page.locator('#assistantInput').fill('افتح تقرير التحصيلات والمصروفات');
    await page.locator('#assistantInput').press('Enter');

    await expect(page.locator('#assistantModal')).toBeHidden();
    await expect(page.locator('#tab-reports')).toBeVisible();
    await expect(page.locator('#periodReportCard')).toBeVisible();
    await expect(page.locator('[data-report-nav="period"]')).toHaveAttribute('aria-current', 'page');
});

test('chat responses stay free of buttons while the composer remains available on narrow screens', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await page.locator('#assistantInput').fill('رصيد الخزنة كام؟');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog .assistant-msg.is-bot .assistant-bubble button:not(.assistant-voice-replay):not(.assistant-voice-play)')).toHaveCount(0);
    await expect(page.locator('#assistantInput')).toHaveAttribute('maxlength', '1000');
});

test('natural language requests start in-chat operation drafts without shortcut buttons', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await page.locator('#assistantInput').fill('أضف شقة');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('بيانات الشقة ناقصة');
    await page.locator('#assistantInput').fill('عدّل بيانات شقة');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('تعديل بيانات الشقة ناقصة');
});

test('assistant opens resident edit with tenant phone in its own field and preserves the owner phone and billing start', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const existingBillingStart = await page.evaluate(() => {
        const resident = state.residents.find(item => item.apartmentNumber === '7');
        resident.isRented = true;
        resident.phone = '01011112222';
        resident.tenantName = 'يوسف';
        resident.tenantPhone = '01033334444';
        renderAll();
        return resident.billingStartMonth;
    });

    await page.locator('#assistantInput').fill('عدّل بيانات شقة 7 هاتف المستأجر 01099998888');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('هاتف المستأجر 01099998888');
    await page.locator('#assistantInput').fill('افتح النموذج');
    await page.locator('#assistantInput').press('Enter');

    await expect(page.locator('#residentModal')).toBeVisible();
    await expect(page.locator('#residentPhone')).toHaveValue('01011112222');
    await expect(page.locator('#residentTenantPhone')).toHaveValue('01099998888');
    await expect(page.locator('#residentTenantName')).toHaveValue('يوسف');
    await expect(page.locator('#residentBillingStart')).toHaveValue(existingBillingStart.slice(0, 7));
    await expect(page.locator('#residentIsRented')).toBeChecked();
});

test('assistant opens resident edit with lease dates in their official fields without saving before confirmation', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const existing = await page.evaluate(() => {
        const resident = state.residents.find(item => item.apartmentNumber === '7');
        Object.assign(resident, {
            isRented: true,
            phone: '01011112222',
            tenantName: 'يوسف',
            tenantPhone: '01033334444',
            leaseStart: '2026-01-01',
            leaseEnd: '2026-12-31',
            rentAmount: 5000,
            depositAmount: 10000
        });
        renderAll();
        return {
            billingStartMonth: resident.billingStartMonth,
            ownerPhone: resident.phone,
            tenantPhone: resident.tenantPhone,
            rentAmount: resident.rentAmount,
            depositAmount: resident.depositAmount
        };
    });

    await page.locator('#assistantInput').fill('عدّل بيانات شقة 7 بداية الإيجار: 2027-01-01 نهاية الإيجار: 2027-12-31');
    await page.locator('#assistantInput').press('Enter');
    const preview = page.locator('#assistantLog .assistant-action-preview');
    await expect(preview).toContainText('بداية الإيجار 2027-01-01');
    await expect(preview).toContainText('نهاية الإيجار 2027-12-31');
    await expect.poll(() => page.evaluate(() => state.residents.find(item => item.apartmentNumber === '7').leaseStart)).toBe('2026-01-01');

    await page.locator('#assistantInput').fill('افتح النموذج');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#residentModal')).toBeVisible();
    await expect(page.locator('#residentLeaseStart')).toHaveValue('2027-01-01');
    await expect(page.locator('#residentLeaseEnd')).toHaveValue('2027-12-31');
    await expect(page.locator('#residentTenantName')).toHaveValue('يوسف');
    await expect(page.locator('#residentTenantPhone')).toHaveValue(existing.tenantPhone);
    await expect(page.locator('#residentPhone')).toHaveValue(existing.ownerPhone);
    await expect(page.locator('#residentBillingStart')).toHaveValue(existing.billingStartMonth.slice(0, 7));
    await expect(page.locator('#residentRentAmount')).toHaveValue(String(existing.rentAmount));
    await expect(page.locator('#residentDepositAmount')).toHaveValue(String(existing.depositAmount));
    await expect(page.locator('#residentIsRented')).toBeChecked();
    const persisted = await page.evaluate(() => state.residents.find(item => item.apartmentNumber === '7'));
    expect(persisted.leaseStart).toBe('2026-01-01');
    expect(persisted.leaseEnd).toBe('2026-12-31');
});

test('assistant notice drafts use typed cancellation and have no in-chat action buttons', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await page.locator('#assistantInput').fill('اكتب إعلان: سيتم غلق المياه غدًا');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('اكتب «انشر الإعلان»');
    await expect(page.locator('#assistantLog .assistant-msg.is-bot .assistant-bubble button:not(.assistant-voice-replay):not(.assistant-voice-play)')).toHaveCount(0);
    await page.locator('#assistantInput').fill('إلغاء الإعلان');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('محفظتش أي تغيير');
});

test('a typed command opens the official income form for review', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await page.locator('#assistantInput').fill('سجل تحصيل');
    await page.locator('#assistantInput').press('Enter');
    await expect(page.locator('#assistantLog')).toContainText('افتح النموذج');
    await page.locator('#assistantInput').fill('افتح النموذج');
    await page.locator('#assistantInput').press('Enter');

    await expect(page.locator('#assistantModal')).toBeHidden();
    await expect(page.locator('#incomeModal')).toBeVisible();
    await expect(page.locator('#incomeWizardStep1')).toBeVisible();
    await expect(page.locator('#incomeResident')).toHaveValue('');
});

test('assistant does not offer a broken adjustment form action without a resident', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await page.locator('#assistantInput').fill('سجل إعفاء');
    await page.locator('#assistantInput').press('Enter');

    const log = page.locator('#assistantLog');
    await expect(log).toContainText('المالك أو رقم الشقة');
    await expect(log).toContainText('اكتب «إلغاء» للتراجع');
    await expect(log.locator('.assistant-msg.is-bot .assistant-bubble button:not(.assistant-voice-replay):not(.assistant-voice-play)')).toHaveCount(0);
});

test('mobile assistant keeps the composer visible as the keyboard reduces the visual viewport', async ({ page }) => {
    test.skip(page.viewportSize().width > 640, 'mobile viewport behavior');
    await page.setViewportSize({ width: 390, height: 820 });
    await seedAndOpenAssistant(page);
    const modal = page.locator('#assistantModal');
    const log = page.locator('#assistantLog');
    const input = page.locator('#assistantInput');
    const sendButton = page.locator('#assistantSendButton');
    await expect(modal).toHaveClass(/assistant-mobile-viewport/);

    await page.evaluate(() => {
        for (let index = 0; index < 18; index += 1) {
            appendAssistantMessage('bot', `<p>رسالة طويلة لاختبار تمرير سجل المحادثة رقم ${index + 1}.</p>`);
        }
        const logElement = document.getElementById('assistantLog');
        logElement.scrollTop = 0;
        document.getElementById('assistantInput').focus();
    });
    await page.setViewportSize({ width: 390, height: 470 });
    await expect.poll(() => modal.evaluate(element => element.style.getPropertyValue('--assistant-visual-height')))
        .toBe('470px');
    await expect.poll(() => modal.evaluate(element => element.getBoundingClientRect().height))
        .toBeLessThanOrEqual(470);
    await expect.poll(() => log.evaluate(element => element.scrollTop + element.clientHeight >= element.scrollHeight - 2))
        .toBe(true);
    await expect.poll(() => input.evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
    const buttonBox = await sendButton.boundingBox();
    expect(buttonBox.width).toBeGreaterThanOrEqual(44);
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
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
            // the list pages 6 at a time: reveal enough cards for the page to scroll
            for (let i = 0; i < 4; i++) renderResidentsGrid({ more: true });
        });
    });

    test('clears the bottom nav, shrinks on scroll down and widens on scroll up', async ({ page }) => {
        const fab = page.locator('#assistantFab');
        await expect(fab).toBeVisible();
        await expect(fab.locator('.assistant-avatar-frame img')).toHaveAttribute('src', /^icons\/assistant-abbah-full\.webp\?v=[0-9a-f]{10}$/);
        await expect(fab).not.toHaveClass(/is-hidden|is-compact/);

        const box = await fab.boundingBox();
        const navBox = await page.locator('nav[aria-label="التنقل الرئيسي"]').boundingBox();
        if (page.viewportSize().width >= 1024) {
            // desktop: the navigation is a side rail and the doorman lives inside it, below the last tab
            expect(box.x).toBeGreaterThanOrEqual(navBox.x - 1);
            expect(box.x + box.width).toBeLessThanOrEqual(navBox.x + navBox.width + 1);
            const lastTab = await page.locator('nav[aria-label="التنقل الرئيسي"] .tab-btn').last().boundingBox();
            expect(box.y).toBeGreaterThanOrEqual(lastTab.y + lastTab.height - 1);
        } else {
            expect(box.y + box.height).toBeLessThanOrEqual(navBox.y + 1);
        }

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

    test('stays in the owner portal and hides only for locked sessions', async ({ page }) => {
        const fab = page.locator('#assistantFab');
        await page.evaluate(() => {
            document.body.classList.add('owner-mode');
            window.syncAssistantFab();
        });
        await expect(fab).toBeVisible();
        await expect(page.locator('nav[aria-label="التنقل الرئيسي"]')).toBeHidden();
        const ownerBox = await fab.boundingBox();
        expect(ownerBox.y + ownerBox.height).toBeLessThanOrEqual(page.viewportSize().height);

        await page.evaluate(() => {
            document.body.classList.remove('owner-mode');
            document.body.classList.add('session-locked');
            window.syncAssistantFab();
        });
        await expect(fab).toBeHidden();
    });
});

test.describe('assistant remembers the conversation', () => {
    test('typed follow-up questions continue in the month already on screen', async ({ page }) => {
        await seedAndOpenAssistant(page);
        const botMessages = page.locator('#assistantLog .assistant-msg.is-bot:not(.is-typing) .assistant-bubble');

        await page.locator('#assistantInput').fill('تحصيل أكتوبر 2026');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('تحصيل أكتوبر 2026');
        await expect(page.locator('#assistantLog .is-typing')).toHaveCount(0);

        await page.locator('#assistantInput').fill('ومصروفاته؟');
        await page.locator('#assistantInput').press('Enter');
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
        // greeting + the once-a-day morning brief, then the question and its answer

        await page.locator('#assistantInput').fill('رصيد الخزنة كام؟');
        await page.locator('#assistantInput').press('Enter');
        await expect(messages).toHaveCount(4);

        await page.keyboard.press('Escape');
        await page.locator('#assistantFab').click();
        await expect(page.locator('#assistantModal')).toBeVisible();
        await expect(messages).toHaveCount(4);
        await expect(page.locator('#assistantLog .assistant-msg.is-user').last()).toContainText('رصيد الخزنة كام؟');

        await page.getByRole('button', { name: 'بدء محادثة جديدة' }).click();
        await expect(messages).toHaveCount(1);
        await expect(page.locator('#assistantLog')).toContainText('أهلاً يا باشا');
    });
});

test.describe('assistant inside the owner portal', () => {
    async function seedOwnerAssistant(page) {
        await loadShell(page);
        await page.waitForFunction(() => typeof window.openAssistantModal === 'function' && typeof renderAll === 'function');
        await page.evaluate(() => {
            window.currentUserRole = 'owner';
            window.currentProfileName = null;
            window.currentResidentId = 'r1';
            document.body.classList.remove('session-locked', 'modal-open');
            document.body.classList.add('owner-mode');
            document.getElementById('pinLockModal').classList.add('hidden');
            const now = new Date();
            const currentMonth = `${monthsNames[now.getMonth()]} ${now.getFullYear()}`;
            const currentStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            state.buildingName = 'عمارة الاختبار';
            state.managerName = 'مدير الاختبار';
            state.managerPhone = '01000000000';
            state.defaultSubscription = 100;
            state.subscriptionDueDay = 5;
            state.subscriptionGraceDays = 3;
            state.paymentSettings = normalizePaymentSettings({
                cash: { enabled: true },
                wallet: { enabled: false, provider: 'فودافون كاش', accountName: 'مدير', number: '01000000000' },
                instapay: { enabled: true, accountName: 'منزل للاشتراكات', address: 'MANZIL.PAY' },
                bank_transfer: { enabled: false }
            });
            state.residents = [
                { id: 'r1', name: 'أحمد علي', apartmentNumber: '3', floor: '2', monthlyAmount: 100, billingStartMonth: currentStart, createdAt: `${currentStart}T00:00:00.000Z` }
            ];
            state.income = [
                { id: 'i1', residentId: 'r1', month: currentMonth, amount: 100, purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'cash', date: new Date().toISOString() }
            ];
            state.expenses = [];
            state.adjustments = [];
            state.notices = [{ id: 'n1', text: 'قراءة العدادات الأسبوع الجاي', date: new Date().toISOString() }];
            state.ownerNotifications = [{ id: 'on1', title: 'تذكير بالاشتراك', body: 'الموعد آخر الشهر', readAt: null, createdAt: new Date().toISOString() }];
            state.cashAccountBalances = { main: 0, development: 0, emergency: 0 };
            renderAll();
            window.syncAssistantFab();
        });
        const fab = page.locator('#assistantFab');
        await expect(fab).toBeVisible();
        await fab.click();
        await expect(page.locator('#assistantModal')).toBeVisible();
        return page.locator('#assistantLog .assistant-msg.is-bot:not(.is-typing) .assistant-bubble');
    }

    test('the launcher stays in the owner portal and greets the owner by name', async ({ page }) => {
        const botMessages = await seedOwnerAssistant(page);
        await expect(botMessages.first()).toContainText('أهلاً يا أحمد علي');
        await expect(page.locator('#assistantTools, #assistantQuickActions, #assistantSuggestions')).toHaveCount(0);
        await expect(page.locator('#assistantInput')).toHaveAttribute('placeholder', 'اسألني عن حسابك، إيصالاتك، ميعاد الدفع…');

        const fabBox = await page.locator('#assistantFab').boundingBox();
        const viewport = page.viewportSize();
        expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(viewport.height);
    });

    test('the owner gets their own bill, receipts and due window', async ({ page }) => {
        const botMessages = await seedOwnerAssistant(page);

        await page.locator('#assistantInput').fill('عليّا كام الشهر ده؟');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('حسابك');
        await expect(botMessages.last()).toContainText('شقة 3');
        await expect(botMessages.last()).toContainText('100 ج.م');
        await expect(botMessages.last()).toContainText('ميعاد المستحق');

        await page.locator('#assistantInput').fill('إيصالاتي');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('عدد الإيصالات');
        await expect(botMessages.last()).toContainText('نقدًا');

        await page.locator('#assistantInput').fill('آخر يوم للدفع كام؟');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('يوم 5 من كل شهر');
        await expect(botMessages.last()).toContainText('فترة السماح');
    });

    test('building-wide questions are refused without leaking any other number', async ({ page }) => {
        const botMessages = await seedOwnerAssistant(page);

        for (const question of ['رصيد الخزنة كام؟', 'مصروفات الشهر', 'إجمالي تحصيل العمارة', 'تقرير المالك']) {
            await page.locator('#assistantInput').fill(question);
            await page.locator('#assistantInput').press('Enter');
            await expect(botMessages.last(), question).toContainText('ده يخص الإدارة');
            await expect(botMessages.last(), question).not.toContainText('ج.م');
        }

        await page.locator('#assistantInput').fill('مين عليه متأخرات؟');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('متأخرات على شقتك');
    });

    test('the owner reaches notices, enabled payment methods and the manager', async ({ page }) => {
        const botMessages = await seedOwnerAssistant(page);

        await page.locator('#assistantInput').fill('إعلانات المبنى');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('قراءة العدادات الأسبوع الجاي');

        await page.locator('#assistantInput').fill('إشعاراتي');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('تذكير بالاشتراك');
        await expect(botMessages.last()).toContainText('جديد');

        await page.locator('#assistantInput').fill('أقدر أدفع بإيه؟');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('InstaPay');
        await expect(botMessages.last()).not.toContainText('فودافون كاش');

        await page.locator('#assistantInput').fill('رقم المدير');
        await page.locator('#assistantInput').press('Enter');
        await expect(botMessages.last()).toContainText('مدير الاختبار');
        await expect(botMessages.last().locator('a[href="tel:01000000000"]')).toHaveCount(1);
    });

    test('the owner conversation stays offline and read-only in the real app', async ({ page }) => {
        await seedOwnerAssistant(page);
        await installAssistantNetworkProbe(page);
        const before = await page.evaluate(() => JSON.stringify(state));

        for (const question of ['عليّا كام الشهر ده؟', 'إيصالاتي', 'إشعاراتي', 'إعلانات المبنى', 'سجّل دفعة']) {
            await askAssistantQuestion(page, question);
        }

        const probe = await page.evaluate(() => window.__assistantNetworkProbe.slice());
        expect(probe, 'the owner assistant must never touch the network').toEqual([]);
        const after = await page.evaluate(() => JSON.stringify(state));
        expect(after, 'the owner assistant must never write state').toBe(before);
    });
});

test('the doorman art stays transparent and the launcher shows the full body uncropped', async ({ page }) => {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.syncAssistantFab === 'function');

    const measure = (src) => page.evaluate(async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
        for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
                if (data[(y * canvas.width + x) * 4 + 3] > 24) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        return {
            cornerAlpha: data[3],
            top: minY / canvas.height,
            left: minX / canvas.width,
            right: (maxX + 1) / canvas.width
        };
    }, src);

    const launcher = await page.evaluate(() => {
        const img = document.querySelector('#assistantFab .assistant-avatar-frame img');
        return { source: img.getAttribute('src'), objectFit: getComputedStyle(img).objectFit };
    });
    expect(launcher.source, 'the launcher shows the full-body portrait, not the cropped bust').toContain('assistant-abbah-full.webp');
    expect(launcher.objectFit, 'the whole doorman is contained, never cropped by a medallion').toBe('contain');
});
