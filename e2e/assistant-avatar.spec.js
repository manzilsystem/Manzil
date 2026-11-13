const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

test.describe.configure({ timeout: 60_000 });

async function seedManager(page) {
    await loadShell(page);
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

async function avatarRequests(page) {
    return page.evaluate(() => performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .filter(name => /(?:js\/vendor\/model-viewer\.min\.js|icons\/assistant-abbah-3d-rigged\.glb)/.test(name)));
}

async function openAssistant(page) {
    await page.locator('#assistantFab').click();
    await expect(page.locator('#assistantModal')).toBeVisible();
}

test('the 3D model is opt-in: the modal opens on the portrait and spends no data', async ({ page }) => {
    await seedManager(page);
    await expect(page.locator('#assistantModal')).toBeHidden();
    expect(await avatarRequests(page), 'nothing 3D may load before the modal opens').toEqual([]);

    await openAssistant(page);
    await expect(page.locator('#assistantAvatarStage')).toBeVisible();
    await expect(page.locator('#assistantAvatarPoster')).toBeVisible();
    await expect(page.locator('#assistantAvatarStage')).not.toHaveClass(/is-3d/);
    await expect(page.locator('#assistantAvatarToggle')).toBeEnabled();
    expect(await avatarRequests(page), 'opening the modal must not download the viewer or the scan').toEqual([]);
    expect(await page.evaluate(() => window.AssistantAvatar3D.state())).toBe('idle');

    await page.locator('#assistantAvatarToggle').click();
    await page.waitForFunction(() => window.AssistantAvatar3D && window.AssistantAvatar3D.isShowing());

    const requests = await avatarRequests(page);
    expect(requests.some(name => name.includes('model-viewer.min.js'))).toBe(true);
    expect(requests.some(name => /assistant-abbah-3d-rigged\.glb\?v=manzil-[0-9a-f]{10}$/.test(name))).toBe(true);

    const viewer = page.locator('#assistantAvatarMount model-viewer');
    await expect(viewer).toHaveAttribute('animation-name', 'Idle');
    await expect(viewer).toHaveAttribute('autoplay', '');
    await expect(page.locator('#assistantAvatarStage')).toHaveClass(/is-3d/);
    await expect(page.locator('#assistantAvatarToggle')).toHaveAttribute('aria-pressed', 'true');
    const stage = await page.locator('#assistantAvatarStage').boundingBox();
    expect(stage.height).toBeGreaterThan(80);

    // GPU throttling once widened the inner canvas past the stage and pushed the
    // model outside an RTL frame; the pinned render scale must keep it inside.
    const canvas = await page.evaluate(() => {
        const viewer = document.querySelector('#assistantAvatarMount model-viewer');
        const visible = [...viewer.shadowRoot.querySelectorAll('canvas')]
            .find(item => getComputedStyle(item).display !== 'none');
        const rect = visible.getBoundingClientRect();
        const stageRect = document.getElementById('assistantAvatarStage').getBoundingClientRect();
        return { w: rect.width, h: rect.height, stageW: stageRect.width, stageH: stageRect.height };
    });
    expect(canvas.w).toBeLessThanOrEqual(canvas.stageW + 1);
    expect(canvas.h).toBeLessThanOrEqual(canvas.stageH + 1);

    await page.locator('#assistantAvatarToggle').click();
    await expect(page.locator('#assistantAvatarStage')).not.toHaveClass(/is-3d/);
    await expect(page.locator('#assistantAvatarToggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#assistantAvatarPoster')).toBeVisible();
    expect(await page.evaluate(() => window.AssistantAvatar3D.isShowing())).toBe(false);
});

test('closing the assistant stops rendering and reopening reuses the loaded model', async ({ page }) => {
    await seedManager(page);
    await openAssistant(page);
    await page.locator('#assistantAvatarToggle').click();
    await page.waitForFunction(() => window.AssistantAvatar3D && window.AssistantAvatar3D.isShowing());
    const before = await avatarRequests(page);

    await page.keyboard.press('Escape');
    await expect(page.locator('#assistantModal')).toBeHidden();
    await expect.poll(() => page.evaluate(() => {
        const viewer = document.querySelector('#assistantAvatarMount model-viewer');
        return viewer ? viewer.style.display : 'missing';
    })).toBe('none');

    await openAssistant(page);
    await expect.poll(() => page.evaluate(() => {
        const viewer = document.querySelector('#assistantAvatarMount model-viewer');
        return viewer ? viewer.style.display : 'missing';
    })).toBe('');
    const after = await avatarRequests(page);
    expect(after.length, 'the model must not download twice').toBe(before.length);
});

test('without WebGL the portrait stays and the toggle disables itself', async ({ page }) => {
    await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type) {
            if (String(type).startsWith('webgl')) return null;
            return original.apply(this, arguments);
        };
    });
    await seedManager(page);
    await openAssistant(page);

    await expect.poll(() => page.evaluate(() => window.AssistantAvatar3D.state())).toBe('unsupported');
    await expect(page.locator('#assistantAvatarStage')).toBeVisible();
    await expect(page.locator('#assistantAvatarPoster')).toBeVisible();
    await expect(page.locator('#assistantAvatarToggle')).toBeHidden();
    await expect(page.locator('#assistantAvatarMount model-viewer')).toHaveCount(0);
    expect(await avatarRequests(page), 'a failed capability check must not spend data').toEqual([]);
    await expect(page.locator('.assistant-head .assistant-avatar img')).toBeVisible();
});
