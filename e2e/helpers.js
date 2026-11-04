// The shell reloads itself once when the service worker first takes control.
// Wait for that handshake so tests never evaluate inside a navigating document.
async function loadShell(page) {
    await page.goto('/index.html');
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 15_000 })
        .catch(() => {});
    await page.waitForLoadState('load');
}

module.exports = { loadShell };
