function switchTab(tab) {
    if (!requireManager()) return;
    const tabs = ['dashboard','income','expenses','residents','reports'];
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

let modalReturnFocus = null;

function openModal(id) {
    if (id !== 'pinLockModal' && !requireManager()) return;
    const modal = document.getElementById(id);
    if (!modal) return;
    modalReturnFocus = document.activeElement;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.classList.add('modal-open');
    if (id === 'backupModal') loadBackupConsole();
    requestAnimationFrame(() => {
        const focusable = modal.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        (focusable || modal).focus();
    });
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.setAttribute('aria-hidden', 'true');
    const anotherModalOpen = Array.from(document.querySelectorAll('[role="dialog"]')).some(item => !item.classList.contains('hidden'));
    if (!anotherModalOpen) document.body.classList.remove('modal-open');
    if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
    modalReturnFocus = null;
}

function handleModalKeyboard(event) {
    const modal = Array.from(document.querySelectorAll('[role="dialog"]')).find(item => !item.classList.contains('hidden'));
    if (!modal) return;
    if (event.key === 'Escape' && modal.id !== 'pinLockModal') {
        event.preventDefault();
        closeModal(modal.id);
        return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter(item => item.offsetParent !== null);
    if (!items.length) { event.preventDefault(); modal.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

async function initApp() {
    await initSupabaseApp();
    document.addEventListener('keydown', handleModalKeyboard);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js').catch(error => console.warn('تعذر تسجيل عامل الخدمة:', error));
    }
}

document.addEventListener('DOMContentLoaded', initApp);
