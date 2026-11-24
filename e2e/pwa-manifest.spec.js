const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function readManifest(page, request) {
    await loadShell(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toMatch(/^manifest\.json\?v=[0-9a-f]{10}$/);
    const response = await request.get(new URL(href, page.url()).toString());
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toMatch(/json/);
    return { manifest: await response.json(), href };
}

test('the PWA manifest is installable and its icons resolve', async ({ page, request }) => {
    const { manifest, href } = await readManifest(page, request);
    expect(manifest).toMatchObject({
        name: expect.any(String),
        short_name: expect.any(String),
        start_url: './',
        scope: './',
        display: 'standalone',
        lang: 'ar',
        dir: 'rtl'
    });

    const base = new URL(href, page.url());
    for (const icon of manifest.icons) {
        expect(icon.type).toBe('image/png');
        expect(['192x192', '512x512']).toContain(icon.sizes);
        const response = await request.get(new URL(icon.src, base).toString());
        expect(response.ok()).toBeTruthy();
        const buffer = await response.body();
        expect(buffer.subarray(1, 4).toString()).toBe('PNG');
        expect(`${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`).toBe(icon.sizes);
    }

    const registration = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return { scriptURL: reg.active?.scriptURL, scope: reg.scope };
    });
    expect(registration.scriptURL).toMatch(/\/sw\.js$/);
    expect(new URL(manifest.start_url, base).href.startsWith(registration.scope)).toBeTruthy();
});

test('the install splash color matches the default app background', async ({ page, request }) => {
    const { manifest } = await readManifest(page, request);
    const bodyColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const hex = `#${bodyColor.match(/\d+/g).slice(0, 3)
        .map(channel => Number(channel).toString(16).padStart(2, '0')).join('')}`;
    expect(manifest.background_color.toLowerCase()).toBe(hex);
});
