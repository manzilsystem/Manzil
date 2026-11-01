function switchTab(tab) {
    ['dashboard','income','expenses','residents','reports'].forEach(t => {
        document.getElementById('tab-'+t)?.classList.toggle('hidden', t !== tab);
        document.getElementById('btn-'+t)?.classList.toggle('active', t === tab);
    });
}

function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('hidden'); m.classList.add('flex'); } }
function closeModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

function initApp() {
    loadState();
    setTheme(state.currentTheme || 'dark');
    renderAll();
    checkPinLockOnStart();
    const ss = document.getElementById('syncStatus');
    if (ss) ss.textContent = githubConfig.gistId ? 'جاهز' : 'غير مفعل';
    if (githubConfig.token && githubConfig.gistId) syncWithGitHubGist(true);
    window.addEventListener('online', () => { const s = document.getElementById('syncStatus'); if (s) s.textContent = 'متصل'; });
    window.addEventListener('offline', () => { const s = document.getElementById('syncStatus'); if (s) s.textContent = 'غير متصل'; });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
}

document.addEventListener('DOMContentLoaded', initApp);
