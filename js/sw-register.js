(() => {
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    let reloading = false;
    let controllerChanges = 0;
    let updatePending = false;
    let updateDeferred = false;
    let updateCard = null;
    const hadController = Boolean(navigator.serviceWorker.controller);

    const appIsBusy = () => {
        if (document.querySelector('[role="dialog"]:not(.hidden)')) return true;
        const active = document.activeElement;
        if (!active || !['INPUT', 'TEXTAREA'].includes(active.tagName)) return false;
        return String(/** @type {HTMLInputElement} */ (active).value || '').trim() !== '';
    };

    const closeUpdateCard = () => {
        if (updateCard) { updateCard.remove(); updateCard = null; }
    };

    const reloadForUpdate = () => {
        reloading = true;
        location.reload();
    };

    const showUpdateCard = () => {
        if (updateCard || updateDeferred || !document.body) return;
        updateCard = document.createElement('div');
        updateCard.setAttribute('role', 'status');
        updateCard.setAttribute('aria-live', 'polite');
        updateCard.style.cssText = 'position:fixed;right:12px;bottom:88px;z-index:90;max-width:calc(100vw - 24px);display:flex;align-items:center;gap:8px;background:#0f766e;color:#fff;padding:10px 14px;border-radius:14px;font-size:12px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.35);';
        const message = document.createElement('span');
        message.textContent = 'يتوفر تحديث جديد للتطبيق.';
        const applyButton = document.createElement('button');
        applyButton.type = 'button';
        applyButton.textContent = 'تحديث الآن';
        applyButton.style.cssText = 'background:#fff;color:#0f766e;border:0;border-radius:10px;padding:6px 10px;font:inherit;font-weight:700;cursor:pointer;';
        applyButton.addEventListener('click', reloadForUpdate);
        const laterButton = document.createElement('button');
        laterButton.type = 'button';
        laterButton.textContent = 'لاحقًا';
        laterButton.style.cssText = 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,.6);border-radius:10px;padding:6px 10px;font:inherit;font-weight:700;cursor:pointer;';
        laterButton.addEventListener('click', () => { updateDeferred = true; closeUpdateCard(); });
        updateCard.append(message, applyButton, laterButton);
        document.body.appendChild(updateCard);
    };

    const applyPendingUpdate = () => {
        if (reloading || !updatePending || updateDeferred) return;
        // Reloading while a dialog or a filled field is open would discard
        // data the user is still entering. Offer the choice instead of
        // interrupting, and apply automatically as soon as the app is idle.
        if (appIsBusy()) { showUpdateCard(); return; }
        reloadForUpdate();
    };

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        controllerChanges += 1;
        // The first install has no controller and already served this page
        // from the network; any later change means an update replaced a
        // worker this page was using.
        if (reloading || (!hadController && controllerChanges === 1)) return;
        updatePending = true;
        showUpdateCard();
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
    }, 30 * 60 * 1000);
    // A download can finish while a dialog is being closed; retry the
    // deferred reload without user action.
    setInterval(() => { if (updatePending) applyPendingUpdate(); }, 5000);
})();
