const CACHE_NAME = 'manzil-v1';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/state.js',
    './js/render.js',
    './js/crud.js',
    './js/app.js',
    './manifest.json',
    './icons/icon.svg'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
            if (res.ok && (e.request.url.includes('cdn.tailwindcss.com') || e.request.url.includes('cdnjs.cloudflare.com') || e.request.url.includes('fonts.googleapis'))) {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
            }
            return res;
        }).catch(() => caches.match('./index.html')))
    );
});
