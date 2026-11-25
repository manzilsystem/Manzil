// @ts-check
// Draggable doorman launcher (phones and tablets). Kept apart from assistant.js, which
// must never touch localStorage: only the launcher's screen position is stored here.
(function () {
const ASSISTANT_FAB_POS_KEY = 'manzilAssistantFabPos';

// Let the user drag the doorman anywhere on phones and tablets; the spot is remembered.
// On desktop he lives in the side navigation, so dragging is off there.
function initAssistantFabDrag() {
    const fab = document.getElementById('assistantFab');
    if (!fab || typeof fab.addEventListener !== 'function') return;
    const dragEnabled = () => !(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches);
    const place = (x, y) => {
        const w = fab.offsetWidth || 102;
        const h = fab.offsetHeight || 118;
        const left = Math.min(Math.max(0, x), window.innerWidth - w);
        const top = Math.min(Math.max(0, y), window.innerHeight - h);
        fab.classList.add('is-dragged');
        fab.style.left = left + 'px';
        fab.style.top = top + 'px';
        fab.style.bottom = 'auto';
        return { left, top };
    };
    try {
        const saved = JSON.parse(localStorage.getItem(ASSISTANT_FAB_POS_KEY) || 'null');
        if (saved && dragEnabled() && Number.isFinite(saved.fx) && Number.isFinite(saved.fy)) {
            place(saved.fx * window.innerWidth, saved.fy * window.innerHeight);
        }
    } catch (_) { /* ignore corrupt saved position */ }
    let start = null;
    let moved = false;
    // The picture must not start the browser's own image drag, which would cancel ours
    fab.addEventListener('dragstart', event => event.preventDefault());
    fab.addEventListener('pointerdown', event => {
        if (!dragEnabled() || event.button > 0) return;
        const rect = fab.getBoundingClientRect();
        start = { px: event.clientX, py: event.clientY, left: rect.left, top: rect.top };
        moved = false;
    });
    window.addEventListener('pointermove', event => {
        if (!start) return;
        const dx = event.clientX - start.px;
        const dy = event.clientY - start.py;
        if (!moved && Math.hypot(dx, dy) < 8) return;
        if (!moved) {
            moved = true;
            fab.classList.add('is-dragging');
        }
        place(start.left + dx, start.top + dy);
    });
    const finish = () => {
        if (!start) return;
        start = null;
        fab.classList.remove('is-dragging');
        if (!moved) return;
        const rect = fab.getBoundingClientRect();
        try {
            localStorage.setItem(ASSISTANT_FAB_POS_KEY, JSON.stringify({ fx: rect.left / window.innerWidth, fy: rect.top / window.innerHeight }));
        } catch (_) { /* storage may be unavailable */ }
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    // A drag must not also open the chat
    fab.addEventListener('click', event => {
        if (moved) { event.stopImmediatePropagation(); event.preventDefault(); moved = false; }
    }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAssistantFabDrag);
else initAssistantFabDrag();
})();
