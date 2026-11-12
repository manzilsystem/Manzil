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

// The 3D stage fetches its own static viewer/model when the modal opens. Those
// same-origin assets carry no conversation data, so the chat probe ignores them
// and still fails on any other network call.
const AVATAR_ASSETS = ['js/vendor/model-viewer.min.js', 'icons/assistant-abbah-3d-rigged.glb'];
const withoutAvatarAssets = entries => entries.filter(entry => !AVATAR_ASSETS.some(asset => entry.includes(asset)));

async function askAssistantQuestion(page, question) {
    const messages = page.locator('#assistantLog .assistant-msg:not(.is-typing)');
    const before = await messages.count();
    await page.locator('#assistantInput').fill(question);
    await page.locator('#assistantInput').press('Enter');
    await expect(messages).toHaveCount(before + 2);
}

test('assistant opens from the launcher and answers local questions', async ({ page }) => {
    await seedAndOpenAssistant(page);
    const botMessages = page.locator('#assistantLog .assistant-msg.is-bot .assistant-bubble');
    await expect(botMessages.first()).toContainText('أهلاً يا أستاذ');
    await expect(page.locator('#assistantInput')).toHaveAttribute('placeholder', /الخزنة/);

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

test('the manager conversation stays offline and read-only in the real app', async ({ page }) => {
    await seedAndOpenAssistant(page);
    await installAssistantNetworkProbe(page);
    const before = await page.evaluate(() => JSON.stringify(state));

    for (const question of ['رصيد الخزنة كام؟', 'ملخص الشهر', 'سجّل دفعة لأحمد', 'احذف مصروف النظافة', 'مين عليه متأخرات؟']) {
        await askAssistantQuestion(page, question);
    }

    const probe = withoutAvatarAssets(await page.evaluate(() => window.__assistantNetworkProbe.slice()));
    expect(probe, 'the assistant must never touch the network').toEqual([]);
    const after = await page.evaluate(() => JSON.stringify(state));
    expect(after, 'the assistant must never write state').toBe(before);
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
        await expect(fab.locator('.assistant-fab-avatar img')).toHaveAttribute('src', /^icons\/assistant-abbah\.png\?v=[0-9a-f]{10}$/);
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
        await expect(page.locator('#assistantSuggestions [data-assistant-query="عليّا كام الشهر ده؟"]')).toBeVisible();
        await expect(page.locator('#assistantSuggestions [data-assistant-query="رصيد الخزنة كام؟"]')).toHaveCount(0);
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

        const probe = withoutAvatarAssets(await page.evaluate(() => window.__assistantNetworkProbe.slice()));
        expect(probe, 'the owner assistant must never touch the network').toEqual([]);
        const after = await page.evaluate(() => JSON.stringify(state));
        expect(after, 'the owner assistant must never write state').toBe(before);
    });
});

test('the doorman art stays transparent and the circular crop never cuts the cap', async ({ page }) => {
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

    const crop = () => page.evaluate(() => {
        const styles = getComputedStyle(document.querySelector('#assistantFab .assistant-avatar-frame img'));
        const matrix = new DOMMatrixReadOnly(styles.transform);
        const [originX, originY] = styles.transformOrigin.split(' ').map(value => parseFloat(value) / 100);
        const visible = 1 / matrix.a;
        return { top: originY - visible / 2, bottom: originY + visible / 2, left: originX - visible / 2, right: originX + visible / 2 };
    });

    for (const src of ['icons/assistant-abbah.png', 'icons/assistant-abbah-full.png']) {
        const box = await measure(src);
        expect(box.cornerAlpha, `${src} must keep a transparent background`).toBe(0);
        expect(box.top, `${src} needs empty space above the cap`).toBeGreaterThan(0.02);
        expect(box.left, `${src} must not touch the left edge`).toBeGreaterThan(0.01);
        expect(box.right, `${src} must not touch the right edge`).toBeLessThan(0.99);
    }

    const launcher = await crop();
    const bust = await measure('icons/assistant-abbah.png');
    expect(launcher.top, 'the circle opens above the turban').toBeLessThanOrEqual(bust.top - 0.01);
    expect(launcher.bottom, 'the circle still frames the face').toBeGreaterThan(bust.top + 0.2);
    expect(launcher.left, 'the circle must not clip the shoulders sideways').toBeLessThanOrEqual(bust.left);
    expect(launcher.right, 'the circle must not clip the shoulders sideways').toBeGreaterThanOrEqual(bust.right);
});
