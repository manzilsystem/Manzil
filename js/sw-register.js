(() => {
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    let reloading = false;
    let controllerChanges = 0;
    let updatePending = false;
    let updateBanner = null;
    const hadController = Boolean(navigator.serviceWorker.controller);

    const appIsBusy = () => {
        if (document.querySelector('[role="dialog"]:not(.hidden)')) return true;
        const active = document.activeElement;
        if (!active || !['INPUT', 'TEXTAREA'].includes(active.tagName)) return false;
        return String(/** @type {HTMLInputElement} */ (active).value || '').trim() !== '';
    };

    const showUpdateBanner = () => {
        if (updateBanner || !document.body) return;
        updateBanner = document.createElement('div');
        updateBanner.setAttribute('role', 'status');
        updateBanner.setAttribute('aria-live', 'polite');
        updateBanner.textContent = 'يتوفر تحديث جديد للتطبيق. سيُطبّق تلقائيًا فور إنهاء النافذة أو الحقل المفتوح.';
        updateBanner.style.cssText = 'position:fixed;right:12px;bottom:88px;z-index:90;max-width:calc(100vw - 24px);background:#0f766e;color:#fff;padding:10px 14px;border-radius:14px;font-size:12px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.35);';
        document.body.appendChild(updateBanner);
    };

    const applyPendingUpdate = () => {
        if (reloading || !updatePending) return;
        // Reloading while a dialog or a filled field is open would discard
        // data the user is still entering. Apply the update automatically
        // as soon as the app is idle instead of requiring a cache clear.
        if (appIsBusy()) { showUpdateBanner(); return; }
        reloading = true;
        location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        controllerChanges += 1;
        // The first install has no controller and already served this page
        // from the network; any later change means an update replaced a
        // worker this page was using.
        if (reloading || (!hadController && controllerChanges === 1)) return;
        updatePending = true;
        applyPendingUpdate();
    });
    const refreshWorker = () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then(registration => registration.update().catch(() => {}))
        .catch(error => console.warn('تعذر تحديث التطبيق تلقائيًا:', error));
    refreshWorker();
    window.addEventListener('pageshow', () => { refreshWorker(); applyPendingUpdate(); });
    window.addEventListener('focus', () => { refreshWorker(); applyPendingUpdate(); });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { refreshWorker(); applyPendingUpdate(); }
    });
    // Installed PWAs can stay open for days without a navigation, which is
    // the only other moment the browser checks for a new worker.
    setInterval(() => {
        if (document.visibilityState === 'visible') refreshWorker();
    }, 15 * 60 * 1000);
    // A download can finish while a dialog is being closed; retry the
    // deferred reload without user action.
    setInterval(() => { if (updatePending) applyPendingUpdate(); }, 5000);
})();
