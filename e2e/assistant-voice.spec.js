const { test, expect } = require('@playwright/test');

test.describe.configure({ timeout: 60_000 });

// The page fetches the model through the service worker; blocking it keeps
// Playwright's request interception authoritative for these download paths.
test.use({ serviceWorkers: 'block' });

async function seedManager(page) {
    await page.goto('/index.html');
    await page.waitForLoadState('load');
    await page.waitForFunction(() => typeof window.openAssistantModal === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        state.cashAccountBalances = { main: 0, development: 0, emergency: 0 };
        state.residents = [];
        state.income = [];
        state.expenses = [];
        state.adjustments = [];
        renderAll();
    });
}

async function openAssistant(page) {
    await page.locator('#assistantFab').click();
    await expect(page.locator('#assistantModal')).toBeVisible();
}

async function speechRequests(page) {
    return page.evaluate(() => performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .filter(name => /(?:js\/vendor\/onnxruntime-web\.min\.js|js\/vendor\/ort-wasm|huggingface\.co)/.test(name)));
}

async function countMicrophoneCalls(page) {
    return page.evaluate(() => window.__voiceMicCalls || 0);
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        window.__voiceMicCalls = 0;
        if (!navigator.mediaDevices) {
            Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
        }
        const media = navigator.mediaDevices;
        const original = typeof media.getUserMedia === 'function' ? media.getUserMedia.bind(media) : null;
        media.getUserMedia = (...args) => {
            window.__voiceMicCalls += 1;
            if (!original) return Promise.reject(new Error('No microphone in this environment'));
            return original(...args);
        };
    });
});

test('nothing speech-related is fetched before the user asks for voice', async ({ page }) => {
    await seedManager(page);
    await openAssistant(page);
    expect(await speechRequests(page), 'the runtime and model must stay lazy').toEqual([]);
    await expect(page.locator('#assistantVoiceDeleteButton')).toBeHidden();
    expect(await countMicrophoneCalls(page)).toBe(0);
});

test('dismissing the consent dialog downloads nothing and keeps the microphone closed', async ({ page }) => {
    await seedManager(page);
    await openAssistant(page);
    const external = [];
    page.on('request', request => {
        if (request.url().includes('huggingface.co')) external.push(request.url());
    });

    await page.locator('#assistantVoiceButton').click();

    await expect(page.locator('#assistantVoiceStatus')).toBeVisible();
    await expect(page.locator('#assistantVoiceStatus')).toContainText('لم يتم تنزيل النموذج');
    expect(external, 'a dismissed dialog must not spend data').toEqual([]);
    expect(await speechRequests(page)).toEqual([]);
    expect(await countMicrophoneCalls(page)).toBe(0);
});

test('an accepted download that fails never opens the microphone', async ({ page }) => {
    await seedManager(page);
    await openAssistant(page);
    page.on('dialog', dialog => dialog.accept());
    const modelRequests = [];
    page.on('request', request => {
        if (request.url().includes('huggingface.co')) modelRequests.push(request.url());
    });
    await page.route('**/huggingface.co/**', route => route.abort('failed'));

    await page.locator('#assistantVoiceButton').click();

    await expect(page.locator('#assistantVoiceStatus')).toBeVisible();
    await expect(page.locator('#assistantVoiceStatus')).toContainText('تعذر تجهيز الصوت', { timeout: 30_000 });
    expect(modelRequests.length, 'the pinned model URL is the only remote call').toBe(1);
    expect(modelRequests[0]).toContain('agharib/egyptian-arabic-wav2vec2-xlsr-53-onnx/resolve/888b8be067d3a1ac2ca72806832f29e8786a3341/');
    const requests = await speechRequests(page);
    expect(requests.some(name => /onnxruntime-web\.min\.js\?v=manzil-[0-9a-f]{10}$/.test(name)), 'the runtime loads only after consent').toBe(true);
    expect(requests.some(name => name.includes('ort-wasm')), 'the WASM backend must wait for a real model').toBe(false);
    expect(await countMicrophoneCalls(page), 'no capture without a verified model').toBe(0);
    expect(await page.evaluate(() => document.getElementById('assistantInput').value)).toBe('');
});
