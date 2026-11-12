/**
 * Progressive 3D doorman for the assistant modal.
 * The viewer module and the rigged GLB are fetched only when the modal first
 * opens; until then the assistant stays exactly as offline as its chat replies.
 * The still portrait inside the stage remains the fallback whenever WebGL or
 * the model fails, and rendering stops as soon as the modal closes.
 */
(function () {
    'use strict';

    const MODAL_ID = 'assistantModal';
    const STAGE_ID = 'assistantAvatarStage';
    const MOUNT_ID = 'assistantAvatarMount';
    const MODEL_URL = 'icons/assistant-abbah-3d-rigged.glb';
    const VIEWER_MODULE = './vendor/model-viewer.min.js';
    const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

    /** @type {any} */
    let viewer = null;
    /** @type {Promise<void>|null} */
    let loading = null;
    /** @type {'idle'|'loading'|'ready'|'error'|'unsupported'} */
    let state = 'idle';

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

    function modalIsOpen() {
        const modal = document.getElementById(MODAL_ID);
        return Boolean(modal && !modal.classList.contains('hidden'));
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
        element.setAttribute('camera-orbit', '0deg 75deg 105%');
        element.setAttribute('interaction-prompt', 'none');
        element.setAttribute('shadow-intensity', '0.6');
        element.setAttribute('environment-image', 'neutral');
        element.setAttribute('exposure', '1.05');
        element.setAttribute('animation-name', 'Idle');
        if (!reducedMotion()) element.setAttribute('autoplay', '');
        element.addEventListener('load', () => {
            state = 'ready';
            const stageElement = stage();
            if (stageElement) stageElement.classList.add('is-ready');
        }, { once: true });
        element.addEventListener('error', () => {
            // Keep the still portrait in place instead of a blank stage.
            state = 'error';
            const stageElement = stage();
            if (stageElement) stageElement.classList.remove('is-ready');
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
            return;
        }
        if (viewer) {
            stageElement.hidden = false;
            play();
            return;
        }
        if (loading) return;

        stageElement.hidden = false;
        state = 'loading';
        const specifier = `${VIEWER_MODULE}?v=${release()}`;
        loading = import(specifier)
            .then(module => {
                // v1 throttling widens the internal canvas when frames are slow;
                // inside an RTL stage that canvas overflows and the model lands
                // outside the frame, so keep the render scale pinned.
                if (module && module.ModelViewerElement) module.ModelViewerElement.minimumRenderScale = 1;
                viewer = createViewer(container);
                if (!modalIsOpen()) pause();
            })
            .catch(() => {
                // No viewer means no network spent on the model; the still
                // portrait in the header keeps the modal usable.
                state = 'error';
                loading = null;
                stageElement.hidden = true;
            });
    }

    function unmount() {
        if (!viewer) return;
        pause();
    }

    function init() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        new MutationObserver(() => {
            if (modal.classList.contains('hidden')) unmount();
            else mount();
        }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) pause();
            else if (modalIsOpen()) play();
        });
    }

    window.AssistantAvatar3D = {
        mount,
        unmount,
        state: () => state,
        isReady: () => state === 'ready'
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
