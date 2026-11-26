const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function openAssistant(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.openAssistantModal === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        state.residents = [];
        state.income = [];
        state.expenses = [];
        state.adjustments = [];
        renderAll();
    });
    await page.locator('#assistantFab').click();
    await expect(page.locator('#assistantModal')).toBeVisible();
    await expect(page.locator('#assistantLog')).toContainText('عم عبده البواب');
}

for (const width of [360, 390]) {
    test.describe(`Amm Abdo voice controls on a ${width}px phone`, () => {
        test.use({ viewport: { width, height: 800 } });

        test('the composer row fits the screen and the mic is a reachable touch target', async ({ page }) => {
            await openAssistant(page);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(1);
            for (const id of ['#assistantInput', '#assistantVoiceButton', '#assistantSendButton']) {
                const box = await page.locator(id).boundingBox();
                expect(box.x).toBeGreaterThanOrEqual(0);
                expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
            }
            const mic = await page.locator('#assistantVoiceButton').boundingBox();
            expect(mic.width).toBeGreaterThanOrEqual(44);
            expect(mic.height).toBeGreaterThanOrEqual(44);
            await expect(page.locator('#assistantInputHint')).toBeVisible();
        });

        test('the sound toggle stays inside the header on a narrow screen', async ({ page }) => {
            await openAssistant(page);
            const sound = page.locator('#assistantSoundButton');
            await expect(sound).toBeVisible();
            const box = await sound.boundingBox();
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
            await expect(page.locator('#assistantModalTitle')).toBeVisible();
        });

        test('a voice replay control on a bot reply stays within the viewport', async ({ page }) => {
            await openAssistant(page);
            await page.locator('#assistantInput').fill('ازيك يا عم عبده');
            await page.locator('#assistantInput').press('Enter');
            const botBubble = page.locator('#assistantLog .assistant-msg.is-bot .assistant-bubble').last();
            await expect(botBubble).toBeVisible();
            const replay = botBubble.locator('button.assistant-voice-replay, button.assistant-voice-play');
            await expect(replay.first()).toBeVisible();
            const bubbleBox = await botBubble.boundingBox();
            expect(bubbleBox.x).toBeGreaterThanOrEqual(0);
            expect(bubbleBox.x + bubbleBox.width).toBeLessThanOrEqual(width + 1);
            const replayBox = await replay.first().boundingBox();
            expect(replayBox.x).toBeGreaterThanOrEqual(0);
            expect(replayBox.x + replayBox.width).toBeLessThanOrEqual(width + 1);
        });
    });
}
