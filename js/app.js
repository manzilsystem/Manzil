// @ts-check
function switchTab(tab) {
    if (!requireManager()) return;
    const tabs = ['dashboard','income','expenses','cashbox','residents','reports'];
    if (!tabs.includes(tab)) return;
    // read before the loop unhides the tab: printResidentStatement() re-enters switchTab('reports') while its own panel is open
    const reportsOpen = !document.getElementById('tab-reports')?.classList.contains('hidden');
    tabs.forEach(t => {
        document.getElementById('tab-' + t)?.classList.toggle('hidden', t !== tab);
        const button = document.getElementById('btn-' + t);
        button?.classList.toggle('active', t === tab);
        if (button) {
            if (t === tab) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        }
    });
    if (tab === 'reports' && !reportsOpen && typeof resetReportView === 'function') resetReportView();
    if (tab === 'reports' && typeof initReportTemplatesUI === 'function') initReportTemplatesUI();
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

// An owner may open only the read-only assistant, which remains scoped to the linked unit.
const OWNER_ALLOWED_MODALS = new Set(['assistantModal']);

function openModal(id) {
    if (id !== 'pinLockModal' && !OWNER_ALLOWED_MODALS.has(id) && !requireManager()) return;
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
    if (id === 'assistantModal' && typeof assistantVoiceStop === 'function') assistantVoiceStop('cancel');
    if (['incomeModal', 'expenseModal', 'adjustmentModal', 'residentModal'].includes(id)
        && typeof clearAssistantOperationContext === 'function') {
        clearAssistantOperationContext();
    }
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
        /** @type {HTMLElement} */ (modal).focus();
        return;
    }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        event.preventDefault();
        /** @type {HTMLElement} */ (last).focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        event.preventDefault();
        /** @type {HTMLElement} */ (first).focus();
    }
}

let pdfLibraryPromise = null;

function ensurePdfLibrary() {
    if (typeof window.html2pdf === 'function') return Promise.resolve();
    if (pdfLibraryPromise) return pdfLibraryPromise;

    pdfLibraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // Self-hosted: the CSP only allows scripts from this origin, so a CDN copy never loads.
        script.src = 'vendor/html2pdf.bundle.min.js';
        script.async = true;
        script.onload = () => {
            if (typeof window.html2pdf === 'function') resolve();
            else reject(new Error('pdf_library_unavailable'));
        };
        script.onerror = () => reject(new Error('pdf_library_failed_to_load'));
        document.head.appendChild(script);
    }).catch(error => {
        pdfLibraryPromise = null;
        throw error;
    });
    return pdfLibraryPromise;
}

async function loadSubscriptionRateAdapter() {
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `js/subscription-rates.js?v=${window.MANZIL_RELEASE || ''}`;
        script.onload = resolve;
        script.onerror = () => reject(new Error('تعذر تحميل وحدة تاريخ الاشتراكات'));
        document.head.appendChild(script);
    });
}

async function initApp() {
    await loadSubscriptionRateAdapter();
    await initSupabaseApp();
    document.addEventListener('keydown', handleModalKeyboard);
    document.addEventListener('keydown', handleReportViewKeydown);
}

// The copyright year follows the clock, and the intro screen leaves the DOM once its fade ends.
function initBrandChrome() {
    const year = new Date().getFullYear();
    document.querySelectorAll('[data-copyright-year]').forEach(node => { node.textContent = String(year); });
    const splash = document.getElementById('appSplash');
    if (splash) {
        const remove = () => splash.remove();
        splash.addEventListener('animationend', event => { if (event.animationName === 'app-splash-out') remove(); });
        setTimeout(remove, 2500);
    }
}

document.addEventListener('DOMContentLoaded', initBrandChrome);
document.addEventListener('DOMContentLoaded', initApp);
