function switchTab(tab) {
    if (!requireManager()) return;
    const tabs = ['dashboard','income','expenses','cashbox','residents','reports'];
    if (!tabs.includes(tab)) return;
    tabs.forEach(t => {
        document.getElementById('tab-' + t)?.classList.toggle('hidden', t !== tab);
        const button = document.getElementById('btn-' + t);
        button?.classList.toggle('active', t === tab);
        if (button) {
            if (t === tab) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

const modalReturnFocus = new Map();

function getOpenModals() {
    return Array.from(document.querySelectorAll('[role="dialog"]'))
        .filter(modal => !modal.classList.contains('hidden'));
}

function getTopmostOpenModal() {
    const openModals = getOpenModals();
    return openModals[openModals.length - 1] || null;
}

function getModalFocusableElements(modal) {
    return Array.from(modal.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )).filter(item => item.offsetParent !== null && !item.closest('[inert], [aria-hidden="true"]'));
}

function focusModal(modal) {
    if (!modal) return;
    const focusable = getModalFocusableElements(modal);
    if (focusable.length) {
        focusable[0].focus();
        return;
    }
    if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
    modal.focus();
}

function openModal(id) {
    if (id !== 'pinLockModal' && !requireManager()) return;
    const modal = document.getElementById(id);
    if (!modal) return;
    if (modal.classList.contains('hidden')) {
        modalReturnFocus.set(id, document.activeElement);
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.classList.add('modal-open');
    if (id === 'backupModal') loadBackupConsole();
    requestAnimationFrame(() => {
        if (!modal.classList.contains('hidden') && getTopmostOpenModal() === modal) {
            focusModal(modal);
        }
    });
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.setAttribute('aria-hidden', 'true');

    const returnFocus = modalReturnFocus.get(id);
    modalReturnFocus.delete(id);

    const topmostModal = getTopmostOpenModal();
    if (!topmostModal) {
        document.body.classList.remove('modal-open');
        if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') {
            returnFocus.focus();
        }
    } else if (returnFocus?.isConnected && topmostModal.contains(returnFocus)) {
        returnFocus.focus();
    } else {
        focusModal(topmostModal);
    }
}

function handleModalKeyboard(event) {
    const modal = getTopmostOpenModal();
    if (!modal) return;
    if (event.key === 'Escape' && modal.id !== 'pinLockModal') {
        event.preventDefault();
        closeModal(modal.id);
        return;
    }
    if (event.key !== 'Tab') return;
    const items = getModalFocusableElements(modal);
    if (!items.length) {
        event.preventDefault();
        if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
        modal.focus();
        return;
    }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
    }
}

async function loadSubscriptionRateAdapter() {
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'js/subscription-rates.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('تعذر تحميل وحدة تاريخ الاشتراكات'));
        document.head.appendChild(script);
    });
}

async function initApp() {
    await loadSubscriptionRateAdapter();
    await initSupabaseApp();
    document.addEventListener('keydown', handleModalKeyboard);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js').catch(error => console.warn('تعذر تسجيل عامل الخدمة:', error));
    }
}

document.addEventListener('DOMContentLoaded', initApp);
