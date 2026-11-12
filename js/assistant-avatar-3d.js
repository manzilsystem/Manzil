/**
 * Progressive 3D doorman for the assistant modal.
 *
 * The polished illustration is the default face of the assistant; the scan's
 * geometry is too coarse to carry the identity on its own, so the 3D model is
 * an explicit "3D" view the user opts into. Only then are the viewer module
 * and the rigged GLB fetched. The still portrait is the fallback whenever WebGL
 * or the model fails, and rendering stops as soon as the modal closes.
 */
(function () {
    'use strict';

    const MODAL_ID = 'assistantModal';
    const STAGE_ID = 'assistantAvatarStage';
    const MOUNT_ID = 'assistantAvatarMount';
    const TOGGLE_ID = 'assistantAvatarToggle';
    const MODEL_URL = 'icons/assistant-abbah-3d-rigged.glb';
    const VIEWER_MODULE = './vendor/model-viewer.min.js';
    const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

    /** @type {any} */
    let viewer = null;
    /** @type {Promise<void>|null} */
    let loading = null;
    /** @type {'idle'|'loading'|'ready'|'error'|'unsupported'} */
    let state = 'idle';
    let wanted = false;

    function release() {
        return (typeof window.MANZIL_RELEASE === 'string' && window.MANZIL_RELEASE) || 'dev';
    }

    function reducedMotion() {
        return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches;
    }

    function supportsWebGL() {
        try {
            const canvas = document.createElement('canvas');
            return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
        } catch (error) {
            return false;
        }
    }

    function stage() {
        return document.getElementById(STAGE_ID);
    }

    function mountPoint() {
        return document.getElementById(MOUNT_ID);
    }

    function toggleButton() {
        return /** @type {HTMLButtonElement|null} */ (document.getElementById(TOGGLE_ID));
    }

    function modalIsOpen() {
        const modal = document.getElementById(MODAL_ID);
        return Boolean(modal && !modal.classList.contains('hidden'));
    }

    function syncStage() {
        const stageElement = stage();
        const toggle = toggleButton();
        const showing = wanted && state === 'ready';
        if (stageElement) stageElement.classList.toggle('is-3d', showing);
        if (!toggle) return;
        const busy = wanted && (state === 'idle' || state === 'loading');
        toggle.setAttribute('aria-pressed', String(showing));
        toggle.setAttribute('aria-busy', String(busy));
        toggle.disabled = busy || state === 'unsupported' || state === 'error';
        toggle.hidden = state === 'unsupported';
        toggle.title = wanted ? 'إرجاع صورة عم عبده' : 'عرض مجسّم 3D تجريبي';
        const icon = toggle.querySelector('i');
        const label = toggle.querySelector('span');
        if (icon) icon.className = `fa-solid ${wanted ? 'fa-image' : 'fa-cube'}`;
        if (label) label.textContent = wanted ? 'الصورة' : '3D';
    }

    function pause() {
        if (!viewer) return;
        viewer.style.display = 'none';
        if (typeof viewer.pause === 'function') viewer.pause();
    }

    function play() {
        if (!viewer) return;
        viewer.style.display = '';
        if (!reducedMotion() && typeof viewer.play === 'function') viewer.play();
    }

    function createViewer(container) {
        const element = document.createElement('model-viewer');
        element.setAttribute('src', `${MODEL_URL}?v=${release()}`);
        element.setAttribute('alt', '');
        // A three-quarter view keeps the shoulder line and the galabeya folds
        // from collapsing into a flat silhouette, and the tighter distance
        // fills the redesigned stage instead of leaving a small figure adrift.
        element.setAttribute('camera-orbit', '22deg 78deg 96%');
        element.setAttribute('camera-target', '0m 0.02m 0m');
        element.setAttribute('interaction-prompt', 'none');
        element.setAttribute('shadow-intensity', '1');
        element.setAttribute('shadow-softness', '0.85');
        element.setAttribute('environment-image', 'neutral');
        // ACES desaturates the ivory galabeya into grey; neutral tone mapping
        // keeps the palette the rig assigns to the scan.
        element.setAttribute('tone-mapping', 'neutral');
        element.setAttribute('exposure', '1.15');
        element.setAttribute('animation-name', 'Idle');
        if (!reducedMotion()) element.setAttribute('autoplay', '');
        element.addEventListener('load', () => {
            state = 'ready';
            syncStage();
            if (!modalIsOpen()) pause();
            else if (wanted) play();
        }, { once: true });
        element.addEventListener('error', () => {
            // Keep the still portrait in place instead of a blank stage.
            state = 'error';
            wanted = false;
            syncStage();
        }, { once: true });
        container.appendChild(element);
        return element;
    }

    function mount() {
        const stageElement = stage();
        const container = mountPoint();
        if (!stageElement || !container) return;
        if (!supportsWebGL()) {
            state = 'unsupported';
            syncStage();
            return;
        }
        if (viewer) {
            stageElement.hidden = false;
            if (wanted) play();
            syncStage();
            return;
        }
        if (loading) return;

        state = 'loading';
        syncStage();
        const specifier = `${VIEWER_MODULE}?v=${release()}`;
        loading = import(specifier)
            .then(module => {
                // v1 throttling widens the internal canvas when frames are slow;
                // inside an RTL stage that canvas overflows and the model lands
                // outside the frame, so keep the render scale pinned.
                if (module && module.ModelViewerElement) module.ModelViewerElement.minimumRenderScale = 1;
                viewer = createViewer(container);
                if (!modalIsOpen()) pause();
                syncStage();
            })
            .catch(() => {
                // No viewer means no network spent on the model; the still
                // portrait in the header keeps the modal usable.
                state = 'error';
                wanted = false;
                loading = null;
                syncStage();
            });
    }

    function unmount() {
        if (!viewer) return;
        pause();
    }

    function toggle() {
        if (!wanted) {
            wanted = true;
            mount();
            syncStage();
            return;
        }
        wanted = false;
        pause();
        syncStage();
    }

    function init() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        const button = toggleButton();
        if (button) button.addEventListener('click', toggle);
        new MutationObserver(() => {
            const stageElement = stage();
            if (modal.classList.contains('hidden')) {
                unmount();
                return;
            }
            if (stageElement) stageElement.hidden = false;
            // Hide the offer up front when this browser cannot render WebGL,
            // so the user never taps a button that cannot work.
            if (state === 'idle' && !supportsWebGL()) state = 'unsupported';
            if (wanted && state === 'ready') play();
            syncStage();
        }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) pause();
            else if (modalIsOpen() && wanted) play();
        });
    }

    window.AssistantAvatar3D = {
        mount,
        unmount,
        toggle,
        state: () => state,
        isReady: () => state === 'ready',
        isShowing: () => Boolean(wanted && state === 'ready')
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
