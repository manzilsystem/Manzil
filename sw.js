const CACHE_NAME = 'manzil-v130';
const APP_CACHE_PREFIX = 'manzil-';
const APP_SHELL = [
    './',
    './index.html',
    './css/style.css',
    './js/sw-register.js',
    './js/telemetry.js',
    './js/state.js',
    './js/access.js',
    './js/render.js',
    './js/crud.js',
    './js/notices.js',
    './js/reports.js',
    './js/settings.js',
    './js/supabase.js',
    './js/cashbox.js',
    './js/subscription-rates.js',
    './js/app.js',
    './js/monthly-close.js',
    './js/backup.js',
    './manifest.json',
    './icons/manzil-logo.png',
    './icons/manzil-full-1.png',
    './icons/manzil-full-2.png',
    './icons/manzil-full-3.png',
    './icons/manzil-full-4.png',
    './icons/manzil-brand.svg',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', event => {
    // Atomic pre-caching aborts the whole install when a single asset 404s,
    // which silently pins clients to the previous release. Store what is
    // reachable and let the next update retry the rest.
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all(APP_SHELL.map(url => fetch(url, { cache: 'reload' })
                .then(response => (response.ok ? cache.put(url, response) : undefined))
                .catch(() => undefined))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith(APP_CACHE_PREFIX) && key !== CACHE_NAME)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        event.respondWith(fetch(request).catch(() => caches.match(request)));
        return;
    }

    if (request.mode === 'navigate') {
        // GitHub Pages serves HTML with a short max-age; revalidate so a release
        // is visible on the next open instead of after the HTTP cache expires.
        event.respondWith(
            fetch(new Request(request, { cache: 'no-cache' })).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
                }
                return response;
            }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
        );
        return;
    }

    event.respondWith(
        fetch(new Request(request, { cache: 'no-cache' })).then(response => {
            if (response.ok && response.type === 'basic') {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
        }).catch(() => caches.match(request))
    );
});
