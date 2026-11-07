const CACHE_NAME = 'manzil-71ee54a4d7';
const APP_CACHE_PREFIX = 'manzil-';
const APP_SHELL = [
    './',
    './index.html',
    './css/style.css?v=3c694e507b',
    './js/sw-register.js?v=aa29152c50',
    './js/telemetry.js?v=manzil-c82efa9c4e',
    './js/state.js?v=78295b7f4b',
    './js/access.js?v=25cf7f6b02',
    './js/render.js?v=a885213bad',
    './js/crud.js?v=fcc706f513',
    './js/notices.js?v=6942db012f',
    './js/reports.js?v=d8c1339c4c',
    './js/settings.js?v=fac82a7797',
    './js/supabase.js?v=397eeb223c',
    './js/cashbox.js?v=e11593fbc7',
    './js/subscription-rates.js?v=manzil-c82efa9c4e',
    './js/app.js?v=27a807c306',
    './js/monthly-close.js?v=b74c3d3b66',
    './js/backup.js?v=3d5a0d5f15',
    './js/assistant.js?v=b06754edc0',
    './manifest.json?v=c17eb7e5e2',
    './icons/manzil-logo.png?v=9751c575fe',
    './icons/manzil-full-1.png?v=be5105a674',
    './icons/manzil-full-2.png?v=73e8771d9e',
    './icons/manzil-full-3.png?v=114bb1656a',
    './icons/manzil-full-4.png?v=c79f2e7275',
    './icons/manzil-brand.svg?v=d9a5d2deca',
    './icons/assistant-abbah.png?v=f00447602d',
    './icons/assistant-abbah-full.png?v=1f40df6bdd',
    './icons/icon-192.png?v=9751c575fe',
    './icons/icon-512.png?v=bd1ed5974d'
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

    // Content-hashed assets carry a "?v=" token that changes whenever the file
    // changes, which makes them immutable: the cached copy is always the newest
    // build for that URL, so it can be served without touching the network.
    if (url.searchParams.has('v')) {
        event.respondWith(
            caches.match(request).then(cached => cached || fetch(request).then(response => {
                if (response.ok && response.type === 'basic') {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            }).catch(() => caches.match(request)))
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
